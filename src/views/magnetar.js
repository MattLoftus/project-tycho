import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// SGR 1806-20 — Magnetar
// Ultra-magnetized neutron star (B ~ 2×10¹⁵ G) that produced the
// brightest extragalactic event ever observed on Dec 27, 2004.
// Features: intense dipole field lines, crust fracture glow,
// periodic giant flare with expanding fireball and ejecta burst.
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let composer, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
const TRANSITION_DURATION = 2200;

// Scene objects
let magnetar;          // core mesh
let coreGlowMat;       // glow material (color shifts during flare)
let crustMat;          // crust fracture material
let fieldLineMat;      // field line material (flashes during flare)
let magnetosphereMat;  // magnetosphere shell
let fireballMesh, fireballMat;
let pulsarLight;

// Particles
let ejectaSystem, ejectaPositions, ejectaVelocities, ejectaSpeeds;
let trappedSystem, trappedData;
const EJECTA_COUNT = 1000;
const TRAPPED_COUNT = 600;

// Flare state machine
let flarePhase = 'quiescent'; // 'quiescent' | 'buildup' | 'spike' | 'tail'
let flareClock = 0;
const QUIESCENT_DUR = 4;   // calm period
const BUILDUP_DUR = 1.5;   // crust stress builds
const SPIKE_DUR = 0.6;     // explosive burst
const TAIL_DUR = 3;        // decaying oscillations
const TOTAL_CYCLE = QUIESCENT_DUR + BUILDUP_DUR + SPIKE_DUR + TAIL_DUR;

// Field line params
const R_MAX = 16;
const FIELD_LINE_COUNT = 24;
const TUBE_RADIUS = 0.05;

// Rotation
let rotAngle = 0;
let fieldGroup; // group for field lines + core (rotates slowly)

// ─── Soft sprite texture (shared) ─────────────────────────────
function makeSpriteTexture(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(12, 8, 16);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1;
  controls.maxDistance = 150;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  clickableObjects = [];
  meshNameMap = new Map();
  flarePhase = 'quiescent';
  flareClock = 0;
  rotAngle = 0;

  // Starfield
  new THREE.TextureLoader().load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  fieldGroup = new THREE.Group();
  scene.add(fieldGroup);

  buildMagnetar();
  buildFieldLines();
  buildMagnetosphere();
  buildFireball();
  buildEjectaParticles();
  buildTrappedParticles();

  // Lighting
  pulsarLight = new THREE.PointLight(0xffeedd, 2.0, 60);
  scene.add(pulsarLight);
  scene.add(new THREE.AmbientLight(0x060608, 0.3));

  // Input
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  focusTransition = null;

  boundOnClick = (event) => {
    if (event.detail === 0) return;
    mouse.x =  (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) focusOn(hits[0].object);
  };

  boundOnMouseMove = (event) => {
    mouse.x =  (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) {
      renderer.domElement.style.cursor = 'pointer';
      const name = meshNameMap.get(hits[0].object);
      if (name && cbHover) cbHover(name, event.clientX, event.clientY);
    } else {
      renderer.domElement.style.cursor = 'default';
      if (cbBlur) cbBlur();
    }
  };

  renderer.domElement.addEventListener('click', boundOnClick);
  renderer.domElement.addEventListener('mousemove', boundOnMouseMove);

  // Post-processing
  const post = createComposer(renderer, scene, camera);
  composer = post.composer;
  bloomPass = post.bloomPass;
  cinematicPass = post.cinematicPass;
  bloomPass.strength = 0.8;
  bloomPass.threshold = 0.5;
  bloomPass.radius = 0.5;
  cinematicPass.uniforms.liftR.value = 1.06;
  cinematicPass.uniforms.liftG.value = 0.98;
  cinematicPass.uniforms.liftB.value = 0.94;
  cinematicPass.uniforms.vignetteIntensity.value = 0.5;
}

// ═══════════════════════════════════════════
// Scene construction
// ═══════════════════════════════════════════

function buildMagnetar() {
  // Core with crust fracture shader
  const coreGeo = new THREE.SphereGeometry(0.3, 48, 48);
  crustMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      flareIntensity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      uniform float flareIntensity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;

      float hash(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.3;
          a *= 0.45;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vLocalPos);

        // Base surface: warm white-blue
        vec3 baseCol = vec3(0.85, 0.88, 0.95);

        // Crust fracture network — glowing orange-red cracks
        float cracks = fbm(dir * 6.0 + vec3(time * 0.05));
        float crackMask = smoothstep(0.35, 0.55, cracks);

        // Fractures intensify before and during flare
        vec3 crackCol = mix(vec3(0.9, 0.3, 0.05), vec3(1.0, 0.8, 0.3), flareIntensity);
        float crackBright = (0.3 + flareIntensity * 1.2) * crackMask;

        // Magnetic pole hotspots
        float poleFactor = abs(dir.y);
        float cap = smoothstep(0.7, 1.0, poleFactor);
        vec3 hotspotCol = vec3(0.6, 0.75, 1.0);
        float hotspotBright = cap * (0.4 + flareIntensity * 0.5);

        // Limb darkening
        float cosA = max(dot(vNormal, vViewDir), 0.0);
        float limb = 0.5 + 0.5 * cosA;

        vec3 col = baseCol * limb;
        col += crackCol * crackBright;
        col += hotspotCol * hotspotBright;

        // During flare spike: entire surface brightens
        col += vec3(1.0, 0.9, 0.7) * flareIntensity * 0.5;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  magnetar = new THREE.Mesh(coreGeo, crustMat);
  fieldGroup.add(magnetar);
  meshNameMap.set(magnetar, 'SGR 1806-20');
  clickableObjects.push(magnetar);

  // Core glow halo
  const glowGeo = new THREE.SphereGeometry(0.8, 32, 32);
  coreGlowMat = new THREE.ShaderMaterial({
    uniforms: { flareIntensity: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal, vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float flareIntensity;
      varying vec3 vNormal, vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 2.0) * 2.5;

        // Shift from blue-white (quiescent) to orange-white (flare)
        vec3 quiescent = mix(vec3(0.8, 0.88, 1.0), vec3(0.3, 0.45, 1.0), rim);
        vec3 flaring = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.5, 0.15), rim);
        vec3 color = mix(quiescent, flaring, flareIntensity);

        float alpha = glow * (0.4 + flareIntensity * 0.15);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  fieldGroup.add(new THREE.Mesh(glowGeo, coreGlowMat));
}

function buildFieldLines() {
  fieldLineMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.47, 0.53, 0.87),
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < FIELD_LINE_COUNT; i++) {
    const phi = (i / FIELD_LINE_COUNT) * Math.PI * 2;
    const points = [];
    for (let theta = 0.08; theta < Math.PI - 0.08; theta += 0.04) {
      const r = R_MAX * Math.sin(theta) * Math.sin(theta);
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.cos(theta);
      const z = r * Math.sin(theta) * Math.sin(phi);
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 64, TUBE_RADIUS, 6, false);
    fieldGroup.add(new THREE.Mesh(tubeGeo, fieldLineMat));
  }
}

function buildMagnetosphere() {
  const sphereGeo = new THREE.SphereGeometry(14, 48, 48);
  magnetosphereMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      flareIntensity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      uniform float flareIntensity;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      float hash(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.1;
          a *= 0.45;
        }
        return v;
      }

      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        vec3 noisePos = normalize(vPosition) * 3.0 + vec3(time * 0.02);
        float n = fbm(noisePos);
        float filament = smoothstep(0.3, 0.6, n);

        // Purple-blue plasma glow
        vec3 col = mix(vec3(0.3, 0.2, 0.6), vec3(0.5, 0.4, 0.9), filament);

        // Brighten during flare — shift warm
        col = mix(col, vec3(0.8, 0.5, 0.3), flareIntensity * 0.4);

        float alpha = rim * filament * 0.10;
        alpha += rim * 0.02; // base rim glow
        alpha *= (1.0 + flareIntensity * 0.5); // subtle brightening during flare
        alpha = clamp(alpha, 0.0, 0.18);

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(sphereGeo, magnetosphereMat));
}

function buildFireball() {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  fireballMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      intensity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal, vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float time, intensity;
      varying vec3 vNormal, vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        // Bright rim with soft interior fill
        float rimGlow = pow(rim, 2.0);
        float fill = 0.25; // base interior visibility

        vec3 hot = vec3(1.0, 0.85, 0.6);
        vec3 edge = vec3(1.0, 0.5, 0.15);
        vec3 col = mix(hot, edge, rim);

        float alpha = intensity * (fill + rimGlow * 0.5);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.7));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  fireballMesh = new THREE.Mesh(geo, fireballMat);
  fireballMesh.scale.setScalar(0.01); // hidden initially
  scene.add(fireballMesh);
}

function buildEjectaParticles() {
  const geo = new THREE.BufferGeometry();
  ejectaPositions = new Float32Array(EJECTA_COUNT * 3);
  ejectaVelocities = new Float32Array(EJECTA_COUNT * 3);
  ejectaSpeeds = new Float32Array(EJECTA_COUNT);

  for (let i = 0; i < EJECTA_COUNT; i++) {
    // Random sphere direction
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.sin(phi) * Math.sin(theta);
    const dz = Math.cos(phi);

    // Start clustered near core
    ejectaPositions[i * 3]     = dx * 0.5;
    ejectaPositions[i * 3 + 1] = dy * 0.5;
    ejectaPositions[i * 3 + 2] = dz * 0.5;

    ejectaVelocities[i * 3]     = dx;
    ejectaVelocities[i * 3 + 1] = dy;
    ejectaVelocities[i * 3 + 2] = dz;

    ejectaSpeeds[i] = 6 + Math.random() * 14;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(ejectaPositions, 3));

  const mat = new THREE.PointsMaterial({
    map: makeSpriteTexture(255, 180, 80),
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  ejectaSystem = new THREE.Points(geo, mat);
  scene.add(ejectaSystem);
}

function buildTrappedParticles() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAPPED_COUNT * 3);
  trappedData = [];

  for (let i = 0; i < TRAPPED_COUNT; i++) {
    const r = 2 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    // Slight vertical scatter
    const y = (Math.random() - 0.5) * 2.0;

    positions[i * 3]     = Math.cos(angle) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    // Speed inversely proportional to radius (faster closer in)
    const speed = 0.5 / Math.pow(r, 0.8);
    trappedData.push({ r, angle, speed, baseY: y });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: makeSpriteTexture(150, 130, 220),
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  trappedSystem = new THREE.Points(geo, mat);
  scene.add(trappedSystem);
}

// ═══════════════════════════════════════════
// Flare state machine helpers
// ═══════════════════════════════════════════

function getFlareIntensity() {
  if (flarePhase === 'quiescent') return 0;
  if (flarePhase === 'buildup') {
    // Slowly ramp 0 → 0.3
    return (flareClock / BUILDUP_DUR) * 0.3;
  }
  if (flarePhase === 'spike') {
    // Sharp spike to 1.0
    const t = flareClock / SPIKE_DUR;
    return 0.3 + 0.7 * Math.pow(1 - Math.abs(t - 0.3) / 0.7, 0.5);
  }
  if (flarePhase === 'tail') {
    // Decaying oscillations
    const t = flareClock / TAIL_DUR;
    const decay = Math.exp(-t * 3.0);
    const osc = Math.abs(Math.sin(t * 12.0));
    return decay * osc * 0.6;
  }
  return 0;
}

// ═══════════════════════════════════════════
// View API
// ═══════════════════════════════════════════

export function animate() {
  const ts = sim.timeScale;
  const dt = 0.016;
  const scaledDt = dt * ts;

  // Slow rotation (~0.5 Hz visual)
  rotAngle += 3.14 * dt * ts;
  fieldGroup.rotation.y = rotAngle;

  // ── Flare state machine ──
  flareClock += scaledDt;
  if (flarePhase === 'quiescent' && flareClock >= QUIESCENT_DUR) {
    flarePhase = 'buildup';
    flareClock = 0;
  } else if (flarePhase === 'buildup' && flareClock >= BUILDUP_DUR) {
    flarePhase = 'spike';
    flareClock = 0;
    // Reset ejecta to core
    for (let i = 0; i < EJECTA_COUNT; i++) {
      const vx = ejectaVelocities[i * 3];
      const vy = ejectaVelocities[i * 3 + 1];
      const vz = ejectaVelocities[i * 3 + 2];
      ejectaPositions[i * 3]     = vx * (0.3 + Math.random() * 0.3);
      ejectaPositions[i * 3 + 1] = vy * (0.3 + Math.random() * 0.3);
      ejectaPositions[i * 3 + 2] = vz * (0.3 + Math.random() * 0.3);
    }
  } else if (flarePhase === 'spike' && flareClock >= SPIKE_DUR) {
    flarePhase = 'tail';
    flareClock = 0;
  } else if (flarePhase === 'tail' && flareClock >= TAIL_DUR) {
    flarePhase = 'quiescent';
    flareClock = 0;
  }

  const intensity = getFlareIntensity();
  const isActive = flarePhase === 'spike' || flarePhase === 'tail';

  // ── Update uniforms ──
  const t = performance.now() / 1000;
  crustMat.uniforms.time.value = t;
  crustMat.uniforms.flareIntensity.value = intensity;
  coreGlowMat.uniforms.flareIntensity.value = intensity;
  magnetosphereMat.uniforms.time.value = t;
  magnetosphereMat.uniforms.flareIntensity.value = intensity;
  fireballMat.uniforms.time.value = t;

  // ── Field line color/opacity pulse ──
  const baseColor = new THREE.Color(0.47, 0.53, 0.87);
  const flareColor = new THREE.Color(1.0, 0.9, 0.7);
  fieldLineMat.color.copy(baseColor).lerp(flareColor, intensity);
  fieldLineMat.opacity = 0.35 + intensity * 0.45;

  // ── Fireball ──
  if (flarePhase === 'spike') {
    const st = flareClock / SPIKE_DUR;
    const scale = 0.5 + st * 3.5;   // max ~4 radius
    fireballMesh.scale.setScalar(scale);
    fireballMat.uniforms.intensity.value = 0.7 * (1.0 - st * 0.4);
  } else if (flarePhase === 'tail') {
    const tt = flareClock / TAIL_DUR;
    const scale = 4.0 + tt * 1.5;
    fireballMesh.scale.setScalar(scale);
    fireballMat.uniforms.intensity.value = Math.max(0, (1 - tt * 1.5) * 0.4);
  } else {
    fireballMesh.scale.setScalar(0.01);
    fireballMat.uniforms.intensity.value = 0;
  }

  // ── Bloom spike ──
  bloomPass.strength = 0.8 + intensity * 0.6;

  // ── Light intensity ──
  pulsarLight.intensity = 2.0 + intensity * 1.5;

  // ── Ejecta particles ──
  if (isActive) {
    ejectaSystem.material.opacity = Math.min(0.7, intensity * 1.5);
    const posAttr = ejectaSystem.geometry.getAttribute('position');
    const arr = posAttr.array;
    for (let i = 0; i < EJECTA_COUNT; i++) {
      const speed = ejectaSpeeds[i];
      arr[i * 3]     += ejectaVelocities[i * 3]     * speed * scaledDt;
      arr[i * 3 + 1] += ejectaVelocities[i * 3 + 1] * speed * scaledDt;
      arr[i * 3 + 2] += ejectaVelocities[i * 3 + 2] * speed * scaledDt;
    }
    posAttr.needsUpdate = true;
  } else {
    ejectaSystem.material.opacity = 0;
  }

  // ── Trapped particles orbit ──
  if (trappedSystem) {
    const posAttr = trappedSystem.geometry.getAttribute('position');
    const arr = posAttr.array;
    // During flare, particles scatter outward
    const scatter = intensity * 0.3;
    for (let i = 0; i < TRAPPED_COUNT; i++) {
      const pd = trappedData[i];
      pd.angle += (pd.speed + intensity * pd.speed * 2.0) * scaledDt;
      const r = pd.r + scatter * pd.r;
      arr[i * 3]     = Math.cos(pd.angle) * r;
      arr[i * 3 + 1] = pd.baseY * (1 + scatter);
      arr[i * 3 + 2] = Math.sin(pd.angle) * r;
    }
    posAttr.needsUpdate = true;
  }

  // ── Focus transition ──
  if (focusTransition) {
    const elapsed = performance.now() - focusTransition.startTime;
    const ft = Math.min(elapsed / focusTransition.duration, 1);
    const ease = ft < 0.5 ? 2 * ft * ft : 1 - Math.pow(-2 * ft + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startTarget, focusTransition.endTarget, ease);
    camera.position.lerpVectors(focusTransition.startCam, focusTransition.endCam, ease);
    if (ft >= 1) focusTransition = null;
  }

  camMove.update(dt);
  controls.update();
  cinematicPass.uniforms.time.value = t;
  composer.render();
}

export function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(window.innerWidth, window.innerHeight);
}

export function dispose() {
  renderer.domElement.removeEventListener('click', boundOnClick);
  renderer.domElement.removeEventListener('mousemove', boundOnMouseMove);
  renderer.domElement.style.cursor = 'default';
  focusTransition = null;
  camMove.dispose();
  trappedData = [];
  scene.clear();
}

export function focusOn(mesh) {
  const name = meshNameMap.get(mesh);
  const target = mesh.getWorldPosition(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = target.clone().add(dir.multiplyScalar(5));

  if (cbFocus) cbFocus(name);

  focusTransition = {
    startCam:    camera.position.clone(),
    endCam,
    startTarget: controls.target.clone(),
    endTarget:   target,
    startTime:   performance.now(),
    duration:    TRANSITION_DURATION,
  };
}

export function getObjects() {
  return [{ name: 'SGR 1806-20', mesh: magnetar }];
}
