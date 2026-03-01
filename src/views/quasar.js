import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// 3C 273 — Quasar / Active Galactic Nucleus
// The first quasar ever identified (1963, Maarten Schmidt).
// A supermassive black hole (~886 million M☉) accreting matter
// at extreme rates, powering relativistic jets that extend
// 200,000 light-years into intergalactic space.
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let composer, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
const TRANSITION_DURATION = 2200;

// Scene objects
let quasarGroup;
let eventHorizon;
let photonRingMat;
let coronaMat;
let coreLight;
let diskUniforms;
let jetCoreUniforms;
let jetEnvelopeUniforms;
let hotspotMatUpper, hotspotMatLower;

// Particles
let jetSystemUpper, jetDataUpper;
let jetSystemLower, jetDataLower;
let diskSystem, diskData;
const JET_PARTICLE_COUNT = 600;
const DISK_PARTICLE_COUNT = 800;

// Constants
const JET_LENGTH = 45;
const DISK_INNER = 3.0;
const DISK_OUTER = 18.0;

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
    for (int i = 0; i < 5; i++) {
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

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(30, 25, 45);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 5;
  controls.maxDistance = 300;
  controls.target.set(0, 5, 0);
  camMove = createCameraMovement(camera, controls);

  clickableObjects = [];
  meshNameMap = new Map();
  accTime = 0;

  // Starfield
  new THREE.TextureLoader().load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  quasarGroup = new THREE.Group();
  quasarGroup.rotation.x = 0.28; // ~16° tilt
  scene.add(quasarGroup);

  buildBlackHole();
  buildAccretionDisk();
  buildJetCore();
  buildJetEnvelope();
  buildJetCocoon();
  buildJetBase();
  buildJetHotspots();
  buildJetParticles();
  buildDiskParticles();

  // Ambient
  scene.add(new THREE.AmbientLight(0x060610, 0.2));

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
  bloomPass.strength = 1.4;
  bloomPass.threshold = 0.55;
  bloomPass.radius = 0.7;
  cinematicPass.uniforms.liftR.value = 0.94;
  cinematicPass.uniforms.liftG.value = 0.96;
  cinematicPass.uniforms.liftB.value = 1.10;
  cinematicPass.uniforms.vignetteIntensity.value = 0.55;
}

// ═══════════════════════════════════════════
// Scene construction
// ═══════════════════════════════════════════

function buildBlackHole() {
  // Event horizon — pure black sphere, high segment count for smooth silhouette
  const ehGeo = new THREE.SphereGeometry(1.5, 64, 64);
  const ehMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  eventHorizon = new THREE.Mesh(ehGeo, ehMat);
  quasarGroup.add(eventHorizon);
  meshNameMap.set(eventHorizon, '3C 273');
  clickableObjects.push(eventHorizon);

  // Photon ring glow — BackSide to avoid visible sphere outline
  const prGeo = new THREE.SphereGeometry(2.4, 48, 48);
  photonRingMat = new THREE.ShaderMaterial({
    uniforms: { pulse: { value: 1.0 } },
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
      uniform float pulse;
      varying vec3 vNormal, vViewDir;
      void main() {
        float facing = max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(facing, 2.0) * 1.2;
        vec3 inner = vec3(1.0, 0.9, 0.7);
        vec3 outer = vec3(1.0, 0.7, 0.3);
        vec3 color = mix(outer, inner, facing);
        gl_FragColor = vec4(color, glow * 0.35 * pulse);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  quasarGroup.add(new THREE.Mesh(prGeo, photonRingMat));

  // Hot corona — use BackSide so it renders as a soft halo around the BH
  const coronaGeo = new THREE.SphereGeometry(3.5, 32, 32);
  coronaMat = new THREE.ShaderMaterial({
    uniforms: { pulse: { value: 1.0 } },
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
      uniform float pulse;
      varying vec3 vNormal, vViewDir;
      void main() {
        float facing = max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(facing, 1.5) * 0.8;
        vec3 color = mix(vec3(0.5, 0.6, 1.0), vec3(0.7, 0.8, 1.0), facing);
        gl_FragColor = vec4(color, glow * 0.12 * pulse);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  quasarGroup.add(new THREE.Mesh(coronaGeo, coronaMat));

  // Point light
  coreLight = new THREE.PointLight(0xffeedd, 1.0, 60);
  quasarGroup.add(coreLight);
}

function buildAccretionDisk() {
  const geo = new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 64);
  diskUniforms = { innerR: { value: DISK_INNER }, outerR: { value: DISK_OUTER }, time: { value: 0 } };

  const diskMat = new THREE.ShaderMaterial({
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
      uniform float innerR, outerR, time;
      varying vec2 vPolar;

      ${NOISE_2D_GLSL}

      void main() {
        float r = vPolar.x, theta = vPolar.y;
        float t = clamp((r - innerR) / (outerR - innerR), 0.0, 1.0);

        // Temperature: T ∝ r^(-3/4)
        float temp = pow(max(1.0 - t * 0.82, 0.01), 2.0);

        // Color: gold inner → orange mid → red-brown outer
        vec3 cHot  = vec3(1.0, 0.85, 0.55);
        vec3 cWarm = vec3(0.92, 0.45, 0.08);
        vec3 cCool = vec3(0.50, 0.12, 0.02);
        vec3 col;
        if (t < 0.2) col = mix(cHot, cWarm, t / 0.2);
        else col = mix(cWarm, cCool, (t - 0.2) / 0.8);

        // Keplerian differential rotation
        float omega = 1.8 / pow(max(r, innerR), 1.5);
        float rotAngle = theta + omega * time;

        // Logarithmic spiral coordinates
        float logR = log(max(r, 0.1));
        float s = rotAngle - logR * 2.5;
        float q = logR;

        // Multi-scale FBM turbulence
        float large = fbm2(vec2(s, q) * 4.8);
        float med   = fbm2(vec2(s * 10.0, q * 11.0) + vec2(13.7, 7.3));
        float fine  = fbm2(vec2(s * 20.0, q * 22.0) + vec2(31.5, 19.1));
        float turb = 0.15 + 0.45 * large + 0.28 * med + 0.12 * fine;
        turb = mix(0.75, turb, smoothstep(0.0, 0.25, t));

        // Doppler beaming — subtle asymmetry, approaching side slightly brighter
        float beta = mix(0.12, 0.03, t); // reduced velocity fraction
        float cosA = cos(rotAngle);
        float doppler = 1.0 + beta * cosA * 1.5; // linear approximation, gentler

        // Emission — tempered to avoid inner blowout, gentle Doppler modulation
        float emission = temp * turb * 0.7 * doppler;

        // Alpha
        float alpha = (0.4 + temp * 0.6) * turb;
        alpha *= smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.65, t);
        alpha = clamp(alpha, 0.0, 0.95);

        gl_FragColor = vec4(col * emission, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const disk = new THREE.Mesh(geo, diskMat);
  disk.rotation.x = -Math.PI / 2;
  quasarGroup.add(disk);

  // Thin offset copy for slight thickness
  const diskBelow = new THREE.Mesh(geo, diskMat);
  diskBelow.rotation.x = -Math.PI / 2;
  diskBelow.position.y = -0.12;
  quasarGroup.add(diskBelow);

  // Scatter haze above/below
  const hazeGeo = new THREE.RingGeometry(2.5, 20, 128, 16);
  const hazeMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying float vRadius;
      void main() {
        vRadius = length(position.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying float vRadius;
      void main() {
        float t = clamp((vRadius - 2.5) / 17.5, 0.0, 1.0);
        float brightness = pow(max(1.0 - t * 0.9, 0.01), 1.5);
        vec3 col = vec3(1.0, 0.8, 0.5) * brightness * 0.2;
        float alpha = brightness * 0.1 * smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.7, t);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const hazeAbove = new THREE.Mesh(hazeGeo, hazeMat);
  hazeAbove.rotation.x = -Math.PI / 2;
  hazeAbove.position.y = 0.6;
  quasarGroup.add(hazeAbove);

  const hazeBelow = new THREE.Mesh(hazeGeo, hazeMat);
  hazeBelow.rotation.x = -Math.PI / 2;
  hazeBelow.position.y = -0.6;
  quasarGroup.add(hazeBelow);
}

function buildJetCore() {
  const halfLen = JET_LENGTH / 2;
  const tipRadius = JET_LENGTH * Math.tan(5 * Math.PI / 180);
  const geo = new THREE.ConeGeometry(tipRadius, JET_LENGTH, 32, 48, true);

  jetCoreUniforms = { time: { value: 0 } };

  const makeCoreMat = (sign) => new THREE.ShaderMaterial({
    uniforms: { ...jetCoreUniforms, jetSign: { value: sign } },
    vertexShader: JET_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      uniform float jetSign;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float halfLen = ${halfLen.toFixed(1)};
        float jetLen = ${JET_LENGTH.toFixed(1)};

        // Height along jet: 0=tip(narrow), 1=base(wide)
        float h = (-vPos.y + halfLen) / jetLen;

        // Radial distance from axis
        float axialDist = length(vPos.xz);
        float maxWidth = h * jetLen * tan(radians(5.0));
        float radialT = axialDist / max(maxWidth, 0.01);

        // Rim lighting
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        // FBM turbulence — flows along jet
        vec3 noisePos = vec3(vPos.x * 0.5, vPos.y * 0.03 + time * jetSign * 0.5, vPos.z * 0.5);
        float turb = fbm(noisePos);

        // Second FBM layer for finer knotty detail
        float detail = fbm(noisePos * 3.0 + vec3(50.0));

        // Internal shock knots — bright periodic bands along jet axis
        float shockKnot = pow(sin(h * 7.0 + time * 0.7) * 0.5 + 0.5, 2.5) * 0.8;
        // Secondary faster knots for fine structure
        float shock2 = pow(sin(h * 16.0 + time * 1.3) * 0.5 + 0.5, 4.0) * 0.35;

        // Color: blue-white core, slightly brighter on-axis
        vec3 baseCol = vec3(0.5, 0.6, 1.0);
        vec3 axisCol = vec3(0.75, 0.8, 1.0);
        vec3 knotCol = vec3(0.9, 0.9, 1.0);
        vec3 col = mix(axisCol, baseCol, smoothstep(0.0, 0.6, radialT));
        col = mix(col, knotCol, shockKnot * 0.4 + shock2 * 0.3);

        // Opacity — center-bright with soft radial falloff
        float coreFill = smoothstep(1.0, 0.15, radialT);
        float centerBright = smoothstep(0.5, 0.0, radialT) * 0.35;
        float alpha = (0.45 + turb * 0.25 + shockKnot * 0.3 + shock2 * 0.15);
        alpha *= (coreFill + centerBright);
        alpha *= smoothstep(0.0, 0.02, h);
        alpha *= smoothstep(1.0, 0.75, h);
        alpha *= (0.5 + rim * 0.5);
        alpha *= 0.65;

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // Upper jet: flip so narrow end is near center
  const upper = new THREE.Mesh(geo, makeCoreMat(1.0));
  upper.rotation.x = Math.PI;
  upper.position.y = JET_LENGTH / 2;
  quasarGroup.add(upper);

  // Lower jet
  const lower = new THREE.Mesh(geo, makeCoreMat(-1.0));
  lower.position.y = -JET_LENGTH / 2;
  quasarGroup.add(lower);
}

function buildJetEnvelope() {
  const halfLen = JET_LENGTH / 2;
  const tipRadius = JET_LENGTH * Math.tan(8 * Math.PI / 180);
  const geo = new THREE.ConeGeometry(tipRadius, JET_LENGTH, 32, 48, true);

  jetEnvelopeUniforms = { time: { value: 0 } };

  const makeEnvMat = (sign) => new THREE.ShaderMaterial({
    uniforms: { ...jetEnvelopeUniforms, jetSign: { value: sign } },
    vertexShader: JET_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      uniform float jetSign;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float halfLen = ${halfLen.toFixed(1)};
        float jetLen = ${JET_LENGTH.toFixed(1)};

        float h = (-vPos.y + halfLen) / jetLen;

        float axialDist = length(vPos.xz);
        float maxWidth = h * jetLen * tan(radians(8.0));
        float radialT = axialDist / max(maxWidth, 0.01);

        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        // FBM at different frequency for complementary structure
        vec3 noisePos = vec3(vPos.x * 0.4, vPos.y * 0.03 + time * jetSign * 0.35, vPos.z * 0.4);
        float turb = fbm(noisePos);

        // Offset shock knots
        float shockKnot = pow(sin(h * 5.0 + time * 0.5 + 1.5) * 0.5 + 0.5, 2.5) * 0.5;

        // Purple-blue color — slightly brighter toward axis
        vec3 baseCol = vec3(0.35, 0.25, 0.75);
        vec3 brightCol = vec3(0.5, 0.4, 0.9);
        vec3 coreBleed = vec3(0.55, 0.55, 0.9);
        vec3 col = mix(coreBleed, baseCol, smoothstep(0.0, 0.4, radialT));
        col = mix(col, brightCol, turb * 0.3 + shockKnot * 0.3);

        float coreFill = smoothstep(1.0, 0.15, radialT);
        float alpha = (0.3 + turb * 0.2 + shockKnot * 0.2);
        alpha *= (coreFill * 0.6 + rim * 0.4);
        alpha *= smoothstep(0.0, 0.03, h);
        alpha *= smoothstep(1.0, 0.75, h);
        alpha *= 0.45;

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const upper = new THREE.Mesh(geo, makeEnvMat(1.0));
  upper.rotation.x = Math.PI;
  upper.position.y = JET_LENGTH / 2;
  quasarGroup.add(upper);

  const lower = new THREE.Mesh(geo, makeEnvMat(-1.0));
  lower.position.y = -JET_LENGTH / 2;
  quasarGroup.add(lower);
}

function buildJetCocoon() {
  const cocoonLen = 50;
  const tipRadius = cocoonLen * Math.tan(12 * Math.PI / 180);
  const geo = new THREE.ConeGeometry(tipRadius, cocoonLen, 24, 24, true);

  const cocoonMat = new THREE.ShaderMaterial({
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
      varying vec3 vNormal, vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 2.0) * 1.5;
        vec3 color = vec3(0.25, 0.18, 0.5);
        gl_FragColor = vec4(color, glow * 0.1);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const upper = new THREE.Mesh(geo, cocoonMat);
  upper.rotation.x = Math.PI;
  upper.position.y = cocoonLen / 2;
  quasarGroup.add(upper);

  const lower = new THREE.Mesh(geo, cocoonMat);
  lower.position.y = -cocoonLen / 2;
  quasarGroup.add(lower);
}

function buildJetBase() {
  // Bright emission where jets emerge — rendered as BackSide halo to avoid sphere outline
  const baseGeo = new THREE.SphereGeometry(2.2, 32, 32);
  const baseMat = new THREE.ShaderMaterial({
    uniforms: { pulse: { value: 1.0 } },
    vertexShader: `
      varying vec3 vNormal, vViewDir;
      varying vec3 vPos;
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
      uniform float pulse;
      varying vec3 vNormal, vViewDir, vPos;
      void main() {
        float facing = max(dot(vViewDir, vNormal), 0.0);
        // Concentrate glow along polar axis (Y)
        float polar = abs(normalize(vPos).y);
        float axialGlow = smoothstep(0.25, 0.85, polar);
        float glow = pow(facing, 1.5) * axialGlow;
        vec3 color = mix(vec3(0.55, 0.6, 0.9), vec3(0.75, 0.8, 1.0), polar);
        gl_FragColor = vec4(color, glow * 0.35 * pulse);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // Elongate along Y to form a bright bipolar nozzle
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.scale.set(1, 2.5, 1);
  quasarGroup.add(baseMesh);
}

function buildJetHotspots() {
  const geo = new THREE.SphereGeometry(4.0, 24, 24);

  const makeMat = () => new THREE.ShaderMaterial({
    uniforms: { pulse: { value: 1.0 } },
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
      uniform float pulse;
      varying vec3 vNormal, vViewDir;
      void main() {
        float facing = max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(facing, 1.5) * 1.2;
        vec3 inner = vec3(0.6, 0.5, 0.9);
        vec3 outer = vec3(0.4, 0.3, 0.7);
        vec3 color = mix(outer, inner, facing);
        gl_FragColor = vec4(color, glow * 0.25 * pulse);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  hotspotMatUpper = makeMat();
  hotspotMatLower = makeMat();

  const upper = new THREE.Mesh(geo, hotspotMatUpper);
  upper.position.y = JET_LENGTH;
  quasarGroup.add(upper);

  const lower = new THREE.Mesh(geo, hotspotMatLower);
  lower.position.y = -JET_LENGTH;
  quasarGroup.add(lower);
}

function buildJetParticles() {
  const tex = makeSpriteTexture(180, 200, 255);
  const mat = new THREE.PointsMaterial({
    map: tex,
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // Helper to build one jet particle system
  function buildOneJet(sign) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(JET_PARTICLE_COUNT * 3);
    const velocities = new Float32Array(JET_PARTICLE_COUNT * 3);
    const speeds = new Float32Array(JET_PARTICLE_COUNT);

    for (let i = 0; i < JET_PARTICLE_COUNT; i++) {
      // sqrt(random) for even area distribution along the jet
      const h = Math.sqrt(Math.random()) * 0.9 + 0.05;
      const angle = Math.random() * Math.PI * 2;
      const maxR = h * JET_LENGTH * Math.tan(4 * Math.PI / 180);
      const r = Math.sqrt(Math.random()) * maxR;

      positions[i * 3]     = Math.cos(angle) * r;
      positions[i * 3 + 1] = h * JET_LENGTH * sign;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      // Slight radial spread + strong axial velocity
      velocities[i * 3]     = (Math.random() - 0.5) * 0.05;
      velocities[i * 3 + 1] = sign;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;

      speeds[i] = 12 + Math.random() * 18;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const system = new THREE.Points(geo, mat);
    quasarGroup.add(system);
    return { system, velocities, speeds };
  }

  const upper = buildOneJet(1);
  jetSystemUpper = upper.system;
  jetDataUpper = { velocities: upper.velocities, speeds: upper.speeds };

  const lower = buildOneJet(-1);
  jetSystemLower = lower.system;
  jetDataLower = { velocities: lower.velocities, speeds: lower.speeds };
}

function buildDiskParticles() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(DISK_PARTICLE_COUNT * 3);
  diskData = [];

  for (let i = 0; i < DISK_PARTICLE_COUNT; i++) {
    const r = DISK_INNER + Math.random() * (DISK_OUTER - DISK_INNER);
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 0.6;

    positions[i * 3]     = Math.cos(angle) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    const speed = 0.5 / Math.pow(r, 1.5);
    diskData.push({ r, angle, speed, baseY: y });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: makeSpriteTexture(255, 200, 120),
    size: 0.25,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  diskSystem = new THREE.Points(geo, mat);
  quasarGroup.add(diskSystem);
}

// ═══════════════════════════════════════════
// View API
// ═══════════════════════════════════════════

export function animate() {
  const ts = sim.timeScale;
  const dt = 0.016;
  const scaledDt = dt * ts;
  accTime += scaledDt;

  // Slow group rotation
  quasarGroup.rotation.y += 0.02 * scaledDt;

  // AGN variability pulsation
  const agnPulse = 1.0 + 0.08 * Math.sin(accTime * 0.4) + 0.05 * Math.sin(accTime * 1.1);
  photonRingMat.uniforms.pulse.value = agnPulse;
  coronaMat.uniforms.pulse.value = agnPulse;
  hotspotMatUpper.uniforms.pulse.value = agnPulse;
  hotspotMatLower.uniforms.pulse.value = agnPulse;
  coreLight.intensity = 1.0 * agnPulse;

  // Bloom modulation
  bloomPass.strength = 1.3 + agnPulse * 0.15;

  // Disk shader time
  diskUniforms.time.value += scaledDt * 0.8;

  // Jet shader time
  jetCoreUniforms.time.value = accTime;
  jetEnvelopeUniforms.time.value = accTime;

  // Jet particles — stream along axis, reset at tip
  updateJetParticles(jetSystemUpper, jetDataUpper, 1, scaledDt);
  updateJetParticles(jetSystemLower, jetDataLower, -1, scaledDt);

  // Disk particles — Keplerian orbits
  if (diskSystem) {
    const posAttr = diskSystem.geometry.getAttribute('position');
    const arr = posAttr.array;
    for (let i = 0; i < DISK_PARTICLE_COUNT; i++) {
      const pd = diskData[i];
      pd.angle += pd.speed * scaledDt;
      arr[i * 3]     = Math.cos(pd.angle) * pd.r;
      arr[i * 3 + 1] = pd.baseY;
      arr[i * 3 + 2] = Math.sin(pd.angle) * pd.r;
    }
    posAttr.needsUpdate = true;
  }

  // Focus transition
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

function updateJetParticles(system, data, sign, scaledDt) {
  if (!system) return;
  const posAttr = system.geometry.getAttribute('position');
  const arr = posAttr.array;
  const vel = data.velocities;
  const spd = data.speeds;

  for (let i = 0; i < JET_PARTICLE_COUNT; i++) {
    const s = spd[i];
    arr[i * 3]     += vel[i * 3]     * s * scaledDt;
    arr[i * 3 + 1] += vel[i * 3 + 1] * s * scaledDt;
    arr[i * 3 + 2] += vel[i * 3 + 2] * s * scaledDt;

    // Reset if past jet tip — respawn at random height for even distribution
    const yDist = Math.abs(arr[i * 3 + 1]);
    if (yDist > JET_LENGTH) {
      const h = 0.05 + Math.random() * 0.3;
      const angle = Math.random() * Math.PI * 2;
      const maxR = h * JET_LENGTH * Math.tan(4 * Math.PI / 180);
      const r = Math.sqrt(Math.random()) * maxR;
      arr[i * 3]     = Math.cos(angle) * r;
      arr[i * 3 + 1] = sign * h * JET_LENGTH;
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
  diskData = [];
  jetDataUpper = null;
  jetDataLower = null;
  accTime = 0;
  scene.clear();
}

export function focusOn(mesh) {
  const name = meshNameMap.get(mesh);
  const target = mesh.getWorldPosition(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = target.clone().add(dir.multiplyScalar(15));

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
  return [{ name: '3C 273', mesh: eventHorizon }];
}
