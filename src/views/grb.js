import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// GRB 221009A — "BOAT" (Brightest Of All Time)
// The most energetic gamma-ray burst ever recorded (Oct 9, 2022).
// A massive Wolf–Rayet star's core collapsed to a black hole,
// launching ultra-relativistic jets (~0.9999c) that punched
// through the dying star's envelope, producing a gamma-ray flash
// so intense it ionized Earth's upper atmosphere from 2.4 Gly away.
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let composer, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
const TRANSITION_DURATION = 2200;

// Scene objects
let grbGroup;
let starMesh, starMat;
let starGlowMesh, starGlowMat;
let bhMesh;
let diskMesh, diskUniforms;
let upperJet, lowerJet, jetCoreMats;
let upperCocoon, lowerCocoon, cocoonMats;
let flashMesh, flashMat;
let ringUpper, ringLower, ringMatUpper, ringMatLower;
let coreLight;

// Particles
let jetSystemUpper, jetDataUpper;
let jetSystemLower, jetDataLower;
let ambientSystem;
const JET_PARTICLE_COUNT = 800;
const AMBIENT_COUNT = 200;

// Constants
const JET_LENGTH = 60;
const JET_HALF = JET_LENGTH / 2;
const JET_ANGLE_DEG = 5;
const COCOON_LENGTH = 50;
const COCOON_HALF = COCOON_LENGTH / 2;
const COCOON_ANGLE_DEG = 10;
const STAR_INITIAL_R = 5;

// State machine
let phase = 'collapse';
let phaseClock = 0;
const COLLAPSE_DUR = 4.0;
const JET_LAUNCH_DUR = 3.0;
const BREAKOUT_DUR = 0.5;
const AFTERGLOW_DUR = 10.0;
const RESET_DUR = 3.0;

// Accumulated time
let accTime = 0;

// ─── Shared GLSL noise (3D) ──────────────────────────────────
const NOISE_GLSL = `
  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.45;
    }
    return v;
  }
`;

// ─── 2D noise for accretion disk ─────────────────────────────
const NOISE_2D_GLSL = `
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x),
               mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p *= 2.1;
      a *= 0.48;
    }
    return v;
  }
`;

// ─── Jet vertex shader ───────────────────────────────────────
const JET_VERTEX = `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// ─── Soft sprite texture ─────────────────────────────────────
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

// ─── Phase intensity helper ──────────────────────────────────
function getPhaseIntensity() {
  if (phase === 'collapse') {
    return (phaseClock / COLLAPSE_DUR) * 0.15;
  }
  if (phase === 'jetLaunch') {
    return 0.15 + (phaseClock / JET_LAUNCH_DUR) * 0.35;
  }
  if (phase === 'breakout') {
    const t = phaseClock / BREAKOUT_DUR;
    const peak = t < 0.3 ? t / 0.3 : 1.0 - (t - 0.3) / 0.7 * 0.3;
    return 0.5 + 0.5 * peak;
  }
  if (phase === 'afterglow') {
    const t = phaseClock / AFTERGLOW_DUR;
    return Math.exp(-t * 2.5) * 0.8;
  }
  return 0;
}

// ─── Jet progress helper ─────────────────────────────────────
function getJetProgress() {
  if (phase === 'collapse') return 0;
  if (phase === 'jetLaunch') {
    const t = phaseClock / JET_LAUNCH_DUR;
    return 0.05 + t * 0.20;
  }
  if (phase === 'breakout') {
    const t = phaseClock / BREAKOUT_DUR;
    return 0.25 + t * 0.35;
  }
  if (phase === 'afterglow') {
    const t = Math.min(phaseClock / 3.0, 1.0);
    return 0.6 + t * 0.4;
  }
  return 0;
}

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(15, 10, 20);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  clickableObjects = [];
  meshNameMap = new Map();
  phase = 'collapse';
  phaseClock = 0;
  accTime = 0;

  // Starfield
  new THREE.TextureLoader().load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  grbGroup = new THREE.Group();
  grbGroup.rotation.z = 0.15;
  grbGroup.rotation.x = 0.1;
  scene.add(grbGroup);

  buildProgenitorStar();
  buildCentralEngine();
  buildJets();
  buildJetCocoon();
  buildBreakoutFlash();
  buildShockwaveRings();
  buildJetParticles();
  buildAmbientParticles();

  // Lighting
  coreLight = new THREE.PointLight(0xeeeeff, 0.6, 60);
  grbGroup.add(coreLight);
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
  bloomPass.strength = 0.8;
  bloomPass.threshold = 0.5;
  bloomPass.radius = 0.6;
  cinematicPass.uniforms.liftR.value = 0.92;
  cinematicPass.uniforms.liftG.value = 0.96;
  cinematicPass.uniforms.liftB.value = 1.12;
  cinematicPass.uniforms.vignetteIntensity.value = 0.5;
}

// ═══════════════════════════════════════════
// Scene construction
// ═══════════════════════════════════════════

function buildProgenitorStar() {
  const geo = new THREE.SphereGeometry(1, 48, 48); // unit sphere, scaled dynamically
  starMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      collapseProgress: { value: 0 },
      opacity: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vNormal, vViewDir, vLocalPos;
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
      uniform float collapseProgress;
      uniform float opacity;
      varying vec3 vNormal, vViewDir, vLocalPos;

      ${NOISE_GLSL}

      void main() {
        vec3 dir = normalize(vLocalPos);

        // Surface convection pattern
        float n = fbm(dir * 4.0 + vec3(time * 0.1));
        float convection = smoothstep(0.3, 0.6, n);

        // Wolf-Rayet: hot blue-white -> dim yellow during collapse
        vec3 hotCol = vec3(0.7, 0.8, 1.0);
        vec3 dimCol = vec3(1.0, 0.85, 0.5);
        vec3 baseCol = mix(hotCol, dimCol, collapseProgress * 0.6);

        // Core brightening during collapse
        float centerBright = (1.0 - abs(dir.y)) * collapseProgress * 0.4;

        // Limb darkening
        float cosA = max(dot(vNormal, vViewDir), 0.0);
        float limb = 0.4 + 0.6 * cosA;

        vec3 col = baseCol * limb * (0.45 + convection * 0.25 + centerBright);

        // Stress cracks during collapse
        float cracks = fbm(dir * 8.0 + vec3(time * 0.2, 0.0, 0.0));
        float crackMask = smoothstep(0.55, 0.65, cracks) * collapseProgress;
        col += vec3(1.0, 0.7, 0.3) * crackMask * 0.3;

        gl_FragColor = vec4(col, opacity);
      }
    `,
    transparent: true,
    depthWrite: true,
  });

  starMesh = new THREE.Mesh(geo, starMat);
  starMesh.scale.setScalar(STAR_INITIAL_R);
  grbGroup.add(starMesh);
  meshNameMap.set(starMesh, 'GRB 221009A');
  clickableObjects.push(starMesh);

  // Star glow halo — BackSide
  const glowGeo = new THREE.SphereGeometry(1, 32, 32);
  starGlowMat = new THREE.ShaderMaterial({
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
        float facing = max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(facing, 3.0) * 1.2;
        vec3 color = mix(vec3(0.5, 0.6, 1.0), vec3(0.7, 0.8, 1.0), facing);
        gl_FragColor = vec4(color, glow * 0.15 * intensity);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  starGlowMesh = new THREE.Mesh(glowGeo, starGlowMat);
  starGlowMesh.scale.setScalar(STAR_INITIAL_R * 1.4);
  grbGroup.add(starGlowMesh);
}

function buildCentralEngine() {
  // Black hole core — hidden initially
  const bhGeo = new THREE.SphereGeometry(0.3, 32, 32);
  const bhMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  bhMesh = new THREE.Mesh(bhGeo, bhMaterial);
  bhMesh.visible = false;
  grbGroup.add(bhMesh);
  meshNameMap.set(bhMesh, 'GRB 221009A');
  clickableObjects.push(bhMesh);

  // Mini accretion disk
  const diskGeo = new THREE.RingGeometry(0.5, 2.5, 128, 16);
  diskUniforms = { time: { value: 0 }, intensity: { value: 0 } };
  const dMat = new THREE.ShaderMaterial({
    uniforms: diskUniforms,
    vertexShader: `
      varying vec2 vPolar;
      void main() {
        vPolar = vec2(length(position.xy), atan(position.y, position.x));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float time, intensity;
      varying vec2 vPolar;
      ${NOISE_2D_GLSL}
      void main() {
        float r = vPolar.x, theta = vPolar.y;
        float t = clamp((r - 0.5) / 2.0, 0.0, 1.0);
        float temp = pow(max(1.0 - t * 0.8, 0.01), 2.0);

        vec3 cHot = vec3(1.0, 0.9, 0.7);
        vec3 cCool = vec3(0.9, 0.4, 0.1);
        vec3 col = mix(cHot, cCool, t);

        float omega = 2.0 / pow(max(r, 0.5), 1.5);
        float rotAngle = theta + omega * time;
        float logR = log(max(r, 0.1));
        float turb = fbm2(vec2(rotAngle - logR * 2.0, logR) * 5.0);

        float emission = temp * turb * 0.8;
        float alpha = (0.3 + temp * 0.6) * turb * intensity;
        alpha *= smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.7, t);

        gl_FragColor = vec4(col * emission, clamp(alpha, 0.0, 0.9));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  diskMesh = new THREE.Mesh(diskGeo, dMat);
  diskMesh.rotation.x = -Math.PI / 2;
  diskMesh.visible = false;
  grbGroup.add(diskMesh);
}

function buildJets() {
  const tipRadius = JET_LENGTH * Math.tan(JET_ANGLE_DEG * Math.PI / 180);
  const geo = new THREE.ConeGeometry(tipRadius, JET_LENGTH, 32, 48, true);

  jetCoreMats = [];

  const makeJetMat = (sign) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        jetSign: { value: sign },
        jetProgress: { value: 0 },
        intensity: { value: 0 },
      },
      vertexShader: JET_VERTEX,
      fragmentShader: `
      precision mediump float;
        uniform float time;
        uniform float jetSign;
        uniform float jetProgress;
        uniform float intensity;
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        ${NOISE_GLSL}

        void main() {
          float halfLen = ${JET_HALF.toFixed(1)};
          float jetLen = ${JET_LENGTH.toFixed(1)};

          // Height along jet: 0=base, 1=tip
          float h = (-vPos.y + halfLen) / jetLen;

          // Clip beyond current jet extent
          if (h > jetProgress) discard;

          float axialDist = length(vPos.xz);
          float maxWidth = h * jetLen * tan(radians(${JET_ANGLE_DEG.toFixed(1)}));
          float radialT = axialDist / max(maxWidth, 0.01);

          float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

          // FBM turbulence — ultra-relativistic flow speed
          vec3 noisePos = vec3(vPos.x * 0.6, vPos.y * 0.02 + time * jetSign * 1.2, vPos.z * 0.6);
          float turb = fbm(noisePos);

          // Aggressive shock knots
          float shockKnot = pow(sin(h * 14.0 + time * 1.5) * 0.5 + 0.5, 2.0) * 0.9;
          float shock2 = pow(sin(h * 25.0 + time * 2.5) * 0.5 + 0.5, 3.0) * 0.5;

          // Brilliant blue-white
          vec3 baseCol = vec3(0.6, 0.7, 1.0);
          vec3 axisCol = vec3(0.85, 0.9, 1.0);
          vec3 knotCol = vec3(1.0, 1.0, 1.0);
          vec3 col = mix(axisCol, baseCol, smoothstep(0.0, 0.5, radialT));
          col = mix(col, knotCol, shockKnot * 0.5 + shock2 * 0.3);

          // Opacity — tight core with sharp radial cutoff
          float coreFill = smoothstep(1.0, 0.1, radialT);
          float centerBright = smoothstep(0.3, 0.0, radialT) * 0.5;
          float alpha = (0.5 + turb * 0.3 + shockKnot * 0.3 + shock2 * 0.2);
          alpha *= (coreFill + centerBright);
          alpha *= smoothstep(0.0, 0.02, h);
          alpha *= smoothstep(jetProgress, max(jetProgress - 0.1, 0.0), h);
          alpha *= (0.4 + rim * 0.6);
          alpha *= intensity * 0.95;

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    jetCoreMats.push(mat);
    return mat;
  };

  // Upper jet
  upperJet = new THREE.Mesh(geo, makeJetMat(1.0));
  upperJet.rotation.x = Math.PI;
  upperJet.position.y = JET_HALF;
  upperJet.visible = false;
  grbGroup.add(upperJet);

  // Lower jet
  lowerJet = new THREE.Mesh(geo, makeJetMat(-1.0));
  lowerJet.position.y = -JET_HALF;
  lowerJet.visible = false;
  grbGroup.add(lowerJet);
}

function buildJetCocoon() {
  const tipRadius = COCOON_LENGTH * Math.tan(COCOON_ANGLE_DEG * Math.PI / 180);
  const geo = new THREE.ConeGeometry(tipRadius, COCOON_LENGTH, 24, 24, true);

  cocoonMats = [];

  const makeCocoonMat = (sign) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        intensity: { value: 0 },
        progress: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal, vViewDir, vPos;
        void main() {
          vPos = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
      precision mediump float;
        uniform float intensity;
        uniform float progress;
        varying vec3 vNormal, vViewDir, vPos;

        ${NOISE_GLSL}

        void main() {
          float h = (-vPos.y + ${COCOON_HALF.toFixed(1)}) / ${COCOON_LENGTH.toFixed(1)};
          if (h > progress) discard;

          float facing = max(dot(vViewDir, vNormal), 0.0);
          float glow = pow(facing, 2.5);

          // FBM noise for volumetric look
          vec3 dir = normalize(vPos);
          float n = fbm(dir * 3.0 + vec3(0.0, h * 2.0, 0.0));
          float filament = 0.3 + n * 0.7;

          // Soften at tip and base
          float edgeFade = smoothstep(0.0, 0.05, h) * smoothstep(progress, max(progress - 0.08, 0.0), h);

          vec3 color = mix(vec3(0.5, 0.25, 0.12), vec3(0.25, 0.12, 0.45), facing);
          gl_FragColor = vec4(color, glow * filament * edgeFade * 0.2 * intensity);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    cocoonMats.push(mat);
    return mat;
  };

  upperCocoon = new THREE.Mesh(geo, makeCocoonMat(1.0));
  upperCocoon.rotation.x = Math.PI;
  upperCocoon.position.y = COCOON_HALF;
  upperCocoon.visible = false;
  grbGroup.add(upperCocoon);

  lowerCocoon = new THREE.Mesh(geo, makeCocoonMat(-1.0));
  lowerCocoon.position.y = -COCOON_HALF;
  lowerCocoon.visible = false;
  grbGroup.add(lowerCocoon);
}

function buildBreakoutFlash() {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  flashMat = new THREE.ShaderMaterial({
    uniforms: { intensity: { value: 0 } },
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
        float facing = max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(facing, 4.0);
        vec3 hot = vec3(0.9, 0.95, 1.0);
        vec3 edge = vec3(0.6, 0.7, 1.0);
        vec3 col = mix(edge, hot, glow);
        float alpha = intensity * glow;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  flashMesh = new THREE.Mesh(geo, flashMat);
  flashMesh.scale.setScalar(0.01);
  grbGroup.add(flashMesh);
}

function buildShockwaveRings() {
  const ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 64);

  const makeMat = () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.7, 0.8, 1.0),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  ringMatUpper = makeMat();
  ringMatLower = makeMat();

  ringUpper = new THREE.Mesh(ringGeo, ringMatUpper);
  ringUpper.rotation.x = Math.PI / 2;
  ringUpper.position.y = 2;
  ringUpper.scale.setScalar(0.01);
  ringUpper.visible = false;
  grbGroup.add(ringUpper);

  ringLower = new THREE.Mesh(ringGeo, ringMatLower);
  ringLower.rotation.x = Math.PI / 2;
  ringLower.position.y = -2;
  ringLower.scale.setScalar(0.01);
  ringLower.visible = false;
  grbGroup.add(ringLower);
}

function buildJetParticles() {
  const tex = makeSpriteTexture(200, 220, 255);
  const mat = new THREE.PointsMaterial({
    map: tex,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  function buildOneJet(sign) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(JET_PARTICLE_COUNT * 3);
    const velocities = new Float32Array(JET_PARTICLE_COUNT * 3);
    const speeds = new Float32Array(JET_PARTICLE_COUNT);

    for (let i = 0; i < JET_PARTICLE_COUNT; i++) {
      const h = Math.sqrt(Math.random()) * 0.8 + 0.05;
      const angle = Math.random() * Math.PI * 2;
      const maxR = h * JET_LENGTH * Math.tan(2 * Math.PI / 180);
      const r = Math.sqrt(Math.random()) * maxR;

      positions[i * 3]     = Math.cos(angle) * r;
      positions[i * 3 + 1] = h * JET_LENGTH * sign;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      velocities[i * 3]     = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = sign;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;

      speeds[i] = 25 + Math.random() * 35;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const system = new THREE.Points(geo, mat.clone());
    system.material.opacity = 0;
    grbGroup.add(system);
    return { system, velocities, speeds };
  }

  const upper = buildOneJet(1);
  jetSystemUpper = upper.system;
  jetDataUpper = { velocities: upper.velocities, speeds: upper.speeds };

  const lower = buildOneJet(-1);
  jetSystemLower = lower.system;
  jetDataLower = { velocities: lower.velocities, speeds: lower.speeds };
}

function buildAmbientParticles() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(AMBIENT_COUNT * 3);

  for (let i = 0; i < AMBIENT_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 25 + Math.random() * 30;
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

// ═══════════════════════════════════════════
// Reset state for looping
// ═══════════════════════════════════════════

function resetToInitial() {
  // Star
  starMesh.scale.setScalar(STAR_INITIAL_R);
  starMesh.visible = true;
  starMat.uniforms.collapseProgress.value = 0;
  starMat.uniforms.opacity.value = 1.0;
  starGlowMesh.scale.setScalar(STAR_INITIAL_R * 1.4);
  starGlowMesh.visible = true;
  starGlowMat.uniforms.intensity.value = 0.6;

  // Central engine
  bhMesh.visible = false;
  diskMesh.visible = false;
  diskUniforms.intensity.value = 0;

  // Jets
  upperJet.visible = false;
  lowerJet.visible = false;
  jetCoreMats.forEach(m => {
    m.uniforms.jetProgress.value = 0;
    m.uniforms.intensity.value = 0;
  });

  // Cocoon
  upperCocoon.visible = false;
  lowerCocoon.visible = false;
  cocoonMats.forEach(m => {
    m.uniforms.progress.value = 0;
    m.uniforms.intensity.value = 0;
  });

  // Flash
  flashMesh.scale.setScalar(0.01);
  flashMat.uniforms.intensity.value = 0;

  // Rings
  ringUpper.visible = false;
  ringLower.visible = false;
  ringUpper.scale.setScalar(0.01);
  ringLower.scale.setScalar(0.01);
  ringMatUpper.opacity = 0;
  ringMatLower.opacity = 0;

  // Jet particles — reset to base positions
  resetJetParticles(jetSystemUpper, jetDataUpper, 1);
  resetJetParticles(jetSystemLower, jetDataLower, -1);
  if (jetSystemUpper) jetSystemUpper.material.opacity = 0;
  if (jetSystemLower) jetSystemLower.material.opacity = 0;
}

function resetJetParticles(system, data, sign) {
  if (!system) return;
  const arr = system.geometry.getAttribute('position').array;
  for (let i = 0; i < JET_PARTICLE_COUNT; i++) {
    const h = Math.sqrt(Math.random()) * 0.8 + 0.05;
    const angle = Math.random() * Math.PI * 2;
    const maxR = h * JET_LENGTH * Math.tan(2 * Math.PI / 180);
    const r = Math.sqrt(Math.random()) * maxR;
    arr[i * 3]     = Math.cos(angle) * r;
    arr[i * 3 + 1] = h * JET_LENGTH * sign;
    arr[i * 3 + 2] = Math.sin(angle) * r;
  }
  system.geometry.getAttribute('position').needsUpdate = true;
}

// ═══════════════════════════════════════════
// View API
// ═══════════════════════════════════════════

export function animate() {
  const ts = sim.timeScale;
  const dt = 0.016;
  const scaledDt = dt * ts;
  accTime += scaledDt;

  // ── State machine ──
  phaseClock += scaledDt;

  if (phase === 'collapse' && phaseClock >= COLLAPSE_DUR) {
    phase = 'jetLaunch';
    phaseClock = 0;
    // Show jets and cocoon
    upperJet.visible = true;
    lowerJet.visible = true;
    upperCocoon.visible = true;
    lowerCocoon.visible = true;
    bhMesh.visible = true;
  } else if (phase === 'jetLaunch' && phaseClock >= JET_LAUNCH_DUR) {
    phase = 'breakout';
    phaseClock = 0;
    // Activate flash and rings
    ringUpper.visible = true;
    ringLower.visible = true;
  } else if (phase === 'breakout' && phaseClock >= BREAKOUT_DUR) {
    phase = 'afterglow';
    phaseClock = 0;
  } else if (phase === 'afterglow' && phaseClock >= AFTERGLOW_DUR) {
    phase = 'reset';
    phaseClock = 0;
  } else if (phase === 'reset' && phaseClock >= RESET_DUR) {
    phase = 'collapse';
    phaseClock = 0;
    resetToInitial();
  }

  const intensity = getPhaseIntensity();
  const jetProgress = getJetProgress();

  // ── Star collapse ──
  if (phase === 'collapse') {
    const t = phaseClock / COLLAPSE_DUR;
    const starScale = STAR_INITIAL_R - t * 3; // 5 → 2
    starMesh.scale.setScalar(starScale);
    starGlowMesh.scale.setScalar(starScale * 1.4);
    starMat.uniforms.collapseProgress.value = t;
    starMat.uniforms.opacity.value = 1.0;
    starGlowMat.uniforms.intensity.value = 0.6 - t * 0.2;
    starMat.uniforms.time.value = accTime;

    // Disk begins forming in last 1.5s
    if (phaseClock > COLLAPSE_DUR - 1.5) {
      diskMesh.visible = true;
      const dt2 = (phaseClock - (COLLAPSE_DUR - 1.5)) / 1.5;
      diskUniforms.intensity.value = dt2 * 0.4;
    }
  } else if (phase === 'jetLaunch') {
    const t = phaseClock / JET_LAUNCH_DUR;
    starMesh.scale.setScalar(2); // stays collapsed
    starGlowMesh.scale.setScalar(2 * 1.4);
    starMat.uniforms.collapseProgress.value = 1.0;
    starMat.uniforms.opacity.value = 1.0 - t * 0.7; // → 0.3
    starMat.uniforms.time.value = accTime;
    starGlowMat.uniforms.intensity.value = 0.4 - t * 0.25;
    diskUniforms.intensity.value = 0.4 + t * 0.4; // → 0.8
  } else if (phase === 'breakout') {
    const t = phaseClock / BREAKOUT_DUR;
    starMat.uniforms.opacity.value = 0.3 - t * 0.2; // → 0.1
    starGlowMat.uniforms.intensity.value = 0.3 - t * 0.2;
    starMat.uniforms.time.value = accTime;
    diskUniforms.intensity.value = 1.0;
  } else if (phase === 'afterglow') {
    const t = phaseClock / AFTERGLOW_DUR;
    const fadeT = Math.min(t * 3, 1.0); // fade in first third
    starMat.uniforms.opacity.value = 0.1 * (1 - fadeT);
    starGlowMat.uniforms.intensity.value = 0.1 * (1 - fadeT);
    starMesh.scale.setScalar(2 - fadeT * 1.7); // → 0.3
    starGlowMesh.scale.setScalar((2 - fadeT * 1.7) * 1.4);
    starMat.uniforms.time.value = accTime;
    if (fadeT >= 1) {
      starMesh.visible = false;
      starGlowMesh.visible = false;
    }
    diskUniforms.intensity.value = Math.exp(-t * 2.0);
  } else if (phase === 'reset') {
    const t = phaseClock / RESET_DUR;
    // Fade everything out
    diskUniforms.intensity.value = Math.max(0, diskUniforms.intensity.value - scaledDt);
    jetCoreMats.forEach(m => { m.uniforms.intensity.value *= 0.9; });
    cocoonMats.forEach(m => { m.uniforms.intensity.value *= 0.9; });
    flashMat.uniforms.intensity.value *= 0.9;
  }

  // ── Accretion disk time ──
  if (diskMesh.visible) {
    diskUniforms.time.value += scaledDt * 1.5;
  }

  // ── Jets ──
  if (phase !== 'collapse' && phase !== 'reset') {
    const jetIntensity = phase === 'breakout' ? 1.0
      : phase === 'afterglow' ? Math.exp(-phaseClock / AFTERGLOW_DUR * 2.0)
      : 0.3 + (phaseClock / JET_LAUNCH_DUR) * 0.7;

    jetCoreMats.forEach(m => {
      m.uniforms.time.value = accTime;
      m.uniforms.jetProgress.value = jetProgress;
      m.uniforms.intensity.value = jetIntensity;
    });
  }

  // ── Cocoon ──
  if (phase !== 'collapse' && phase !== 'reset') {
    const cocoonProgress = Math.max(0, jetProgress - 0.05);
    const cocoonIntensity = phase === 'breakout' ? 0.8
      : phase === 'afterglow' ? Math.exp(-phaseClock / AFTERGLOW_DUR * 1.5) * 0.7
      : (phaseClock / JET_LAUNCH_DUR) * 0.5;

    cocoonMats.forEach(m => {
      m.uniforms.progress.value = cocoonProgress;
      m.uniforms.intensity.value = cocoonIntensity;
    });
  }

  // ── Breakout flash ──
  if (phase === 'breakout') {
    const t = phaseClock / BREAKOUT_DUR;
    const scale = 0.5 + t * 7.5; // → 8
    flashMesh.scale.setScalar(scale);
    const flashIntensity = t < 0.3 ? (t / 0.3) * 0.95 : 0.95 - (t - 0.3) / 0.7 * 0.45;
    flashMat.uniforms.intensity.value = flashIntensity;
  } else if (phase === 'afterglow') {
    const t = Math.min(phaseClock / 2.0, 1.0);
    flashMesh.scale.setScalar(8 + t * 7); // → 15
    flashMat.uniforms.intensity.value = 0.5 * (1 - t);
    if (t >= 1) flashMat.uniforms.intensity.value = 0;
  } else if (phase !== 'reset') {
    flashMesh.scale.setScalar(0.01);
    flashMat.uniforms.intensity.value = 0;
  }

  // ── Shockwave rings ──
  if (phase === 'breakout' || (phase === 'afterglow' && phaseClock < 3.0)) {
    const elapsed = phase === 'breakout' ? phaseClock : BREAKOUT_DUR + phaseClock;
    const totalDur = BREAKOUT_DUR + 3.0;
    const t = elapsed / totalDur;
    const ringScale = 0.5 + t * 14.5;
    ringUpper.scale.setScalar(ringScale);
    ringLower.scale.setScalar(ringScale);
    ringMatUpper.opacity = 0.25 * (1 - t);
    ringMatLower.opacity = 0.25 * (1 - t);
  } else {
    ringUpper.visible = false;
    ringLower.visible = false;
    ringUpper.scale.setScalar(0.01);
    ringLower.scale.setScalar(0.01);
    ringMatUpper.opacity = 0;
    ringMatLower.opacity = 0;
  }

  // ── Jet particles ──
  const jetParticleActive = phase === 'jetLaunch' || phase === 'breakout' || phase === 'afterglow';
  if (jetParticleActive) {
    const pOpacity = intensity * 0.6;
    if (jetSystemUpper) jetSystemUpper.material.opacity = Math.min(0.5, pOpacity);
    if (jetSystemLower) jetSystemLower.material.opacity = Math.min(0.5, pOpacity);
    updateJetParticles(jetSystemUpper, jetDataUpper, 1, scaledDt, jetProgress);
    updateJetParticles(jetSystemLower, jetDataLower, -1, scaledDt, jetProgress);
  } else {
    if (jetSystemUpper) jetSystemUpper.material.opacity = 0;
    if (jetSystemLower) jetSystemLower.material.opacity = 0;
  }

  // ── Bloom modulation ──
  if (phase === 'collapse') {
    const t = phaseClock / COLLAPSE_DUR;
    bloomPass.strength = 0.6 + t * 0.2;
    bloomPass.threshold = 0.65;
  } else if (phase === 'jetLaunch') {
    const t = phaseClock / JET_LAUNCH_DUR;
    bloomPass.strength = 0.9 + t * 0.3;
    bloomPass.threshold = 0.5;
  } else if (phase === 'breakout') {
    const t = phaseClock / BREAKOUT_DUR;
    const spike = t < 0.3 ? t / 0.3 : 1.0 - (t - 0.3) / 0.7 * 0.3;
    bloomPass.strength = 1.2 + spike * 1.8;
    bloomPass.threshold = 0.5 - spike * 0.3;
  } else if (phase === 'afterglow') {
    const t = phaseClock / AFTERGLOW_DUR;
    bloomPass.strength = 1.5 * Math.exp(-t * 1.5) + 0.8;
    bloomPass.threshold = 0.3 + t * 0.2;
  } else {
    bloomPass.strength = 0.8;
    bloomPass.threshold = 0.5;
  }

  // ── Cinematic color shift ──
  if (phase === 'breakout') {
    cinematicPass.uniforms.liftR.value = 0.92 + intensity * 0.08;
    cinematicPass.uniforms.liftB.value = 1.12 + intensity * 0.08;
  } else if (phase === 'afterglow') {
    const t = phaseClock / AFTERGLOW_DUR;
    cinematicPass.uniforms.liftR.value = 0.92 + t * 0.12;
    cinematicPass.uniforms.liftB.value = 1.12 - t * 0.15;
  } else {
    cinematicPass.uniforms.liftR.value = 0.92;
    cinematicPass.uniforms.liftB.value = 1.12;
  }

  // ── Light intensity ──
  coreLight.intensity = 0.6 + intensity * 3.0;

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
  cinematicPass.uniforms.time.value = accTime;
  composer.render();
}

function updateJetParticles(system, data, sign, scaledDt, maxProgress) {
  if (!system) return;
  const posAttr = system.geometry.getAttribute('position');
  const arr = posAttr.array;
  const vel = data.velocities;
  const spd = data.speeds;
  const maxDist = maxProgress * JET_LENGTH;

  for (let i = 0; i < JET_PARTICLE_COUNT; i++) {
    const s = spd[i];
    arr[i * 3]     += vel[i * 3]     * s * scaledDt;
    arr[i * 3 + 1] += vel[i * 3 + 1] * s * scaledDt;
    arr[i * 3 + 2] += vel[i * 3 + 2] * s * scaledDt;

    const yDist = Math.abs(arr[i * 3 + 1]);
    if (yDist > maxDist || yDist > JET_LENGTH) {
      const h = 0.05 + Math.random() * 0.3;
      const angle = Math.random() * Math.PI * 2;
      const maxR = h * JET_LENGTH * Math.tan(2 * Math.PI / 180);
      const r = Math.sqrt(Math.random()) * maxR;
      arr[i * 3]     = Math.cos(angle) * r;
      arr[i * 3 + 1] = sign * h * maxDist;
      arr[i * 3 + 2] = Math.sin(angle) * r;
    }
  }
  posAttr.needsUpdate = true;
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
  jetDataUpper = null;
  jetDataLower = null;
  accTime = 0;
  scene.clear();
}

export function focusOn(mesh) {
  const name = meshNameMap.get(mesh);
  const target = mesh.getWorldPosition(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = target.clone().add(dir.multiplyScalar(8));

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
  return [{ name: 'GRB 221009A', mesh: starMesh }];
}
