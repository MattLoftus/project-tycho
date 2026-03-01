import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// GW170817 — Neutron Star Merger / Kilonova
// First observed binary neutron star merger (Aug 17, 2017).
// Two neutron stars spiral inward via gravitational wave emission,
// merge in a violent kilonova — an explosion powered by radioactive
// decay of r-process heavy elements (gold, platinum, uranium).
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let composer, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
const TRANSITION_DURATION = 2200;

// Scene objects
let starA, starB;         // neutron star meshes
let glowA, glowB;        // glow halos
let glowMatA, glowMatB;
let lightA, lightB;       // point lights tracking stars
let mergerGroup;          // group holding both stars (not rotating — we position directly)

// Merger flash
let fireballMesh, fireballMat;

// Kilonova ejecta cloud
let ejectaCloudMesh, ejectaCloudMat;

// Ejecta particles
let ejectaSystem, ejectaPositions, ejectaVelocities, ejectaSpeeds;
const EJECTA_COUNT = 800;

// Ambient particles
let ambientSystem;
const AMBIENT_COUNT = 200;

// GW ripple ring pool
const GW_POOL_SIZE = 14;
const gwRings = [];       // { mesh, mat, radius, active }
let gwSpawnTimer = 0;

// Orbital trail
const TRAIL_COUNT = 200;
let trailSystem, trailPositions, trailAlphas, trailIndex;

// Orbital state
let orbitAngle = 0;
let orbitRadius = 0;
const R_MAX = 10;
const BASE_OMEGA = 0.5; // base angular velocity

// State machine
let phase = 'inspiral';  // 'inspiral' | 'chirp' | 'merger' | 'kilonova' | 'reset'
let phaseClock = 0;
const INSPIRAL_DUR = 6;
const CHIRP_DUR = 3;
const MERGER_DUR = 0.5;
const KILONOVA_DUR = 5;
const RESET_DUR = 0.5;

let rAtChirpStart = 0;   // orbital radius when chirp begins

// ─── Soft sprite texture ─────────────────────────────
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
  camera.position.set(0, 12, 25);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  clickableObjects = [];
  meshNameMap = new Map();
  phase = 'inspiral';
  phaseClock = 0;
  orbitAngle = 0;
  orbitRadius = R_MAX;
  gwSpawnTimer = 0;
  trailIndex = 0;

  // Starfield
  new THREE.TextureLoader().load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  mergerGroup = new THREE.Group();
  scene.add(mergerGroup);

  buildNeutronStars();
  buildGWRings();
  buildFireball();
  buildEjectaCloud();
  buildEjectaParticles();
  buildAmbientParticles();
  buildOrbitalTrail();

  // Lighting
  scene.add(new THREE.AmbientLight(0x060610, 0.3));

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
  bloomPass.strength = 0.7;
  bloomPass.threshold = 0.6;
  bloomPass.radius = 0.5;
  cinematicPass.uniforms.liftR.value = 0.96;
  cinematicPass.uniforms.liftG.value = 0.97;
  cinematicPass.uniforms.liftB.value = 1.08;
  cinematicPass.uniforms.vignetteIntensity.value = 0.5;
}

// ═══════════════════════════════════════════
// Scene construction
// ═══════════════════════════════════════════

function buildNeutronStars() {
  const starGeo = new THREE.SphereGeometry(0.25, 24, 24);
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xccddff,
    emissive: 0x8899cc,
    emissiveIntensity: 2.0,
  });

  starA = new THREE.Mesh(starGeo, starMat);
  starB = new THREE.Mesh(starGeo, starMat);
  mergerGroup.add(starA);
  mergerGroup.add(starB);

  meshNameMap.set(starA, 'GW170817');
  meshNameMap.set(starB, 'GW170817');
  clickableObjects.push(starA, starB);

  // Glow halos
  const glowGeo = new THREE.SphereGeometry(0.6, 24, 24);
  const makeGlowMat = () => new THREE.ShaderMaterial({
    uniforms: { intensity: { value: 1.0 } },
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
      uniform float intensity;
      varying vec3 vNormal, vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 2.5) * 2.0;
        vec3 col = mix(vec3(0.7, 0.8, 1.0), vec3(0.4, 0.5, 1.0), rim);
        float alpha = glow * 0.5 * intensity;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  glowMatA = makeGlowMat();
  glowMatB = makeGlowMat();
  glowA = new THREE.Mesh(glowGeo, glowMatA);
  glowB = new THREE.Mesh(glowGeo, glowMatB);
  mergerGroup.add(glowA);
  mergerGroup.add(glowB);

  // Point lights
  lightA = new THREE.PointLight(0xaaccff, 1.5, 20);
  lightB = new THREE.PointLight(0xaaccff, 1.5, 20);
  mergerGroup.add(lightA);
  mergerGroup.add(lightB);
}

function buildGWRings() {
  const ringGeo = new THREE.TorusGeometry(1, 0.008, 4, 64);
  for (let i = 0; i < GW_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.15, 0.12, 0.35),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = Math.PI / 2; // lay flat in XZ plane
    mesh.scale.setScalar(0.01);
    mesh.visible = false;
    scene.add(mesh);
    gwRings.push({ mesh, mat, radius: 0, active: false });
  }
}

function buildFireball() {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  fireballMat = new THREE.ShaderMaterial({
    uniforms: {
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
      uniform float intensity;
      varying vec3 vNormal, vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float rimGlow = pow(rim, 2.0);
        float fill = 0.3;
        // Hot blue-white center to orange edge
        vec3 hot = vec3(0.85, 0.9, 1.0);
        vec3 edge = vec3(1.0, 0.6, 0.2);
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
  fireballMesh.scale.setScalar(0.01);
  scene.add(fireballMesh);
}

function buildEjectaCloud() {
  const geo = new THREE.SphereGeometry(1, 48, 48);
  ejectaCloudMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      progress: { value: 0 },    // 0→1 over kilonova phase
      intensity: { value: 0 },
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
      uniform float progress;
      uniform float intensity;
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
        vec3 dir = normalize(vPosition);
        float dist = length(vPosition);

        // FBM noise for cloud texture
        float n = fbm(dir * 4.0 + vec3(time * 0.03));
        float filament = smoothstep(0.25, 0.55, n);

        // Color evolution: blue-white → deep red/purple (lanthanide opacity)
        vec3 earlyCol = vec3(0.7, 0.75, 1.0);
        vec3 lateCol = vec3(0.8, 0.15, 0.3);
        vec3 col = mix(earlyCol, lateCol, progress);

        // Shell edge
        float shellEdge = smoothstep(0.85, 1.0, dist);
        float shellInner = smoothstep(0.5, 0.7, dist);
        float shellMask = shellInner * (1.0 - shellEdge);

        float alpha = filament * shellMask * 0.35;
        alpha += shellMask * 0.05; // base glow
        alpha *= (0.3 + rim * 0.7);
        alpha *= intensity;

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.3));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ejectaCloudMesh = new THREE.Mesh(geo, ejectaCloudMat);
  ejectaCloudMesh.scale.setScalar(0.01);
  scene.add(ejectaCloudMesh);
}

function buildEjectaParticles() {
  const geo = new THREE.BufferGeometry();
  ejectaPositions = new Float32Array(EJECTA_COUNT * 3);
  ejectaVelocities = new Float32Array(EJECTA_COUNT * 3);
  ejectaSpeeds = new Float32Array(EJECTA_COUNT);

  for (let i = 0; i < EJECTA_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.sin(phi) * Math.sin(theta);
    const dz = Math.cos(phi);

    ejectaPositions[i * 3]     = dx * 0.3;
    ejectaPositions[i * 3 + 1] = dy * 0.3;
    ejectaPositions[i * 3 + 2] = dz * 0.3;

    ejectaVelocities[i * 3]     = dx;
    ejectaVelocities[i * 3 + 1] = dy;
    ejectaVelocities[i * 3 + 2] = dz;

    // Equatorial concentration: polar particles slower (tidal ejecta asymmetry)
    const polarFactor = Math.abs(dy); // 0=equatorial, 1=polar
    const baseSpeed = 5 + Math.random() * 12;
    ejectaSpeeds[i] = baseSpeed * (1.0 - polarFactor * 0.5);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(ejectaPositions, 3));

  const mat = new THREE.PointsMaterial({
    map: makeSpriteTexture(255, 200, 140),
    size: 0.25,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  ejectaSystem = new THREE.Points(geo, mat);
  scene.add(ejectaSystem);
}

function buildAmbientParticles() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(AMBIENT_COUNT * 3);

  for (let i = 0; i < AMBIENT_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 20 + Math.random() * 30;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: makeSpriteTexture(180, 180, 220),
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  ambientSystem = new THREE.Points(geo, mat);
  scene.add(ambientSystem);
}

function buildOrbitalTrail() {
  const geo = new THREE.BufferGeometry();
  trailPositions = new Float32Array(TRAIL_COUNT * 3);
  trailAlphas = new Float32Array(TRAIL_COUNT);

  // Initialize off-screen
  for (let i = 0; i < TRAIL_COUNT; i++) {
    trailPositions[i * 3]     = 0;
    trailPositions[i * 3 + 1] = -1000;
    trailPositions[i * 3 + 2] = 0;
    trailAlphas[i] = 0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(trailAlphas, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.2, 12.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float soft = 1.0 - smoothstep(0.0, 1.0, d);
        gl_FragColor = vec4(0.6, 0.7, 1.0, vAlpha * soft * 0.4);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  trailSystem = new THREE.Points(geo, mat);
  scene.add(trailSystem);
  trailIndex = 0;
}

// ═══════════════════════════════════════════
// Orbital mechanics
// ═══════════════════════════════════════════

function getOrbitalRadius() {
  if (phase === 'inspiral') {
    // Linear decay: visible gradual spiral from R_MAX → ~35% of R_MAX
    const t = Math.min(phaseClock / INSPIRAL_DUR, 1.0);
    return R_MAX * (1 - t * 0.65);
  }
  if (phase === 'chirp') {
    // Accelerating plunge: slow start then rapid final approach
    const t = Math.min(phaseClock / CHIRP_DUR, 1.0);
    const ease = t * t; // quadratic acceleration
    return rAtChirpStart + (0.5 - rAtChirpStart) * ease;
  }
  return 0.3; // merged
}

function getOmega(r) {
  // Kepler: ω ∝ r^(-3/2), clamped to prevent infinity
  const clampedR = Math.max(r, 0.3);
  return BASE_OMEGA * Math.pow(R_MAX / clampedR, 1.5);
}

function getGWSpawnInterval() {
  if (phase === 'inspiral') {
    const t = phaseClock / INSPIRAL_DUR;
    return 1.0 - t * 0.5; // 1.0 → 0.5
  }
  if (phase === 'chirp') {
    const t = phaseClock / CHIRP_DUR;
    return 0.4 - t * 0.28; // 0.4 → 0.12 (rapid-fire at end)
  }
  return 999; // no spawning during merger/kilonova
}

// ═══════════════════════════════════════════
// View API
// ═══════════════════════════════════════════

export function animate() {
  const ts = sim.timeScale;
  const dt = 0.016;
  const scaledDt = dt * ts;

  // ── State machine ──
  phaseClock += scaledDt;

  if (phase === 'inspiral' && phaseClock >= INSPIRAL_DUR) {
    phase = 'chirp';
    rAtChirpStart = getOrbitalRadius();
    phaseClock = 0;
  } else if (phase === 'chirp' && phaseClock >= CHIRP_DUR) {
    phase = 'merger';
    phaseClock = 0;
    // Reset ejecta particles to center
    for (let i = 0; i < EJECTA_COUNT; i++) {
      const vx = ejectaVelocities[i * 3];
      const vy = ejectaVelocities[i * 3 + 1];
      const vz = ejectaVelocities[i * 3 + 2];
      ejectaPositions[i * 3]     = vx * (0.2 + Math.random() * 0.2);
      ejectaPositions[i * 3 + 1] = vy * (0.2 + Math.random() * 0.2);
      ejectaPositions[i * 3 + 2] = vz * (0.2 + Math.random() * 0.2);
    }
  } else if (phase === 'merger' && phaseClock >= MERGER_DUR) {
    phase = 'kilonova';
    phaseClock = 0;
  } else if (phase === 'kilonova' && phaseClock >= KILONOVA_DUR) {
    phase = 'reset';
    phaseClock = 0;
  } else if (phase === 'reset' && phaseClock >= RESET_DUR) {
    phase = 'inspiral';
    phaseClock = 0;
    orbitAngle = 0;
    orbitRadius = R_MAX;
    // Clear trail
    for (let i = 0; i < TRAIL_COUNT; i++) {
      trailPositions[i * 3 + 1] = -1000;
      trailAlphas[i] = 0;
    }
    trailIndex = 0;
    // Deactivate all GW rings
    gwRings.forEach(ring => {
      ring.active = false;
      ring.mesh.visible = false;
    });
  }

  const starsVisible = phase === 'inspiral' || phase === 'chirp';
  const mergerActive = phase === 'merger' || phase === 'kilonova';

  // ── Orbit calculation ──
  if (starsVisible) {
    orbitRadius = getOrbitalRadius();
    const omega = getOmega(orbitRadius);
    orbitAngle += omega * scaledDt;

    const ax = Math.cos(orbitAngle) * orbitRadius;
    const az = Math.sin(orbitAngle) * orbitRadius;
    const bx = Math.cos(orbitAngle + Math.PI) * orbitRadius;
    const bz = Math.sin(orbitAngle + Math.PI) * orbitRadius;

    starA.position.set(ax, 0, az);
    starB.position.set(bx, 0, bz);
    glowA.position.copy(starA.position);
    glowB.position.copy(starB.position);
    lightA.position.copy(starA.position);
    lightB.position.copy(starB.position);

    starA.visible = true;
    starB.visible = true;
    glowA.visible = true;
    glowB.visible = true;
    lightA.visible = true;
    lightB.visible = true;

    // Update orbital trail
    trailPositions[trailIndex * 3]     = ax;
    trailPositions[trailIndex * 3 + 1] = 0;
    trailPositions[trailIndex * 3 + 2] = az;
    trailAlphas[trailIndex] = 1.0;
    trailIndex = (trailIndex + 1) % TRAIL_COUNT;

    // Fade older trail points
    for (let i = 0; i < TRAIL_COUNT; i++) {
      trailAlphas[i] *= 0.993;
    }
    trailSystem.geometry.getAttribute('position').needsUpdate = true;
    trailSystem.geometry.getAttribute('alpha').needsUpdate = true;
  } else {
    starA.visible = false;
    starB.visible = false;
    glowA.visible = false;
    glowB.visible = false;
    lightA.visible = false;
    lightB.visible = false;
  }

  // ── GW ring spawning ──
  if (starsVisible) {
    gwSpawnTimer += scaledDt;
    const interval = getGWSpawnInterval();
    if (gwSpawnTimer >= interval) {
      gwSpawnTimer = 0;
      // Find inactive ring
      const ring = gwRings.find(r => !r.active);
      if (ring) {
        ring.active = true;
        ring.radius = orbitRadius;
        ring.mesh.scale.setScalar(ring.radius);
        ring.mat.opacity = 0.04;
        ring.mesh.visible = true;
      }
    }
  }

  // ── GW ring expansion ──
  const GW_SPEED = 12;
  for (const ring of gwRings) {
    if (!ring.active) continue;
    ring.radius += GW_SPEED * scaledDt;
    ring.mesh.scale.setScalar(ring.radius);
    // Fade as it expands
    ring.mat.opacity = Math.max(0, 0.04 * (1 - ring.radius / 45));
    if (ring.radius > 45 || ring.mat.opacity <= 0) {
      ring.active = false;
      ring.mesh.visible = false;
    }
  }

  // ── Merger flash (fireball) — immediate and bright ──
  if (phase === 'merger') {
    const mt = phaseClock / MERGER_DUR;
    // Start at visible size 2.0 and expand rapidly
    const scale = 2.0 + mt * 4.0;
    fireballMesh.scale.setScalar(scale);
    fireballMat.uniforms.intensity.value = 0.85 * (1.0 - mt * 0.2);
  } else if (phase === 'kilonova') {
    // Fireball continues into kilonova, expanding and fading over first 1.5s
    const ft = Math.min(phaseClock / 1.5, 1.0);
    const scale = 6.0 + ft * 3.0;
    fireballMesh.scale.setScalar(scale);
    fireballMat.uniforms.intensity.value = Math.max(0, 0.6 * (1 - ft));
  } else {
    fireballMesh.scale.setScalar(0.01);
    fireballMat.uniforms.intensity.value = 0;
  }

  // ── Kilonova ejecta cloud ──
  if (phase === 'kilonova') {
    const kt = phaseClock / KILONOVA_DUR;
    const cloudScale = 1.0 + kt * 14;
    ejectaCloudMesh.scale.setScalar(cloudScale);
    ejectaCloudMat.uniforms.progress.value = kt;
    ejectaCloudMat.uniforms.intensity.value = Math.exp(-kt * 1.5);
    ejectaCloudMat.uniforms.time.value = performance.now() / 1000;
  } else if (phase === 'merger') {
    // Small initial cloud
    const mt = phaseClock / MERGER_DUR;
    ejectaCloudMesh.scale.setScalar(0.5 + mt * 0.5);
    ejectaCloudMat.uniforms.progress.value = 0;
    ejectaCloudMat.uniforms.intensity.value = mt * 0.5;
    ejectaCloudMat.uniforms.time.value = performance.now() / 1000;
  } else {
    ejectaCloudMesh.scale.setScalar(0.01);
    ejectaCloudMat.uniforms.intensity.value = 0;
  }

  // ── Ejecta particles ──
  if (mergerActive) {
    const posAttr = ejectaSystem.geometry.getAttribute('position');
    const arr = posAttr.array;

    let intensity;
    if (phase === 'merger') {
      intensity = 0.8;
    } else {
      const kt = phaseClock / KILONOVA_DUR;
      intensity = Math.exp(-kt * 2.0);
    }
    ejectaSystem.material.opacity = Math.min(0.6, intensity);

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

  // ── Bloom modulation ──
  if (phase === 'merger') {
    const mt = phaseClock / MERGER_DUR;
    // Instant spike that fades slightly through the merger
    bloomPass.strength = 1.5 - mt * 0.3;
  } else if (phase === 'kilonova') {
    const kt = phaseClock / KILONOVA_DUR;
    bloomPass.strength = 0.7 + 0.4 * Math.exp(-kt * 2.0);
  } else if (phase === 'chirp') {
    const ct = phaseClock / CHIRP_DUR;
    bloomPass.strength = 0.7 + ct * 0.15;
  } else {
    bloomPass.strength = 0.7;
  }

  // ── Cinematic color shift during kilonova (cool → warm) ──
  if (phase === 'kilonova') {
    const kt = phaseClock / KILONOVA_DUR;
    cinematicPass.uniforms.liftR.value = 0.96 + kt * 0.12;
    cinematicPass.uniforms.liftB.value = 1.08 - kt * 0.16;
  } else {
    cinematicPass.uniforms.liftR.value = 0.96;
    cinematicPass.uniforms.liftB.value = 1.08;
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
  cinematicPass.uniforms.time.value = performance.now() / 1000;
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
  return [{ name: 'GW170817', mesh: starA }];
}
