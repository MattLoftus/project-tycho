import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// NGC 6543 — Cat's Eye Nebula (Planetary Nebula)
// One of the most structurally complex planetary nebulae known.
// A dying Sun-like star ejects shells of ionized gas in its final
// AGB phase. Features nested shells, bipolar lobes, and vivid
// emission-line colors: [O III] blue-green, H-alpha pink, [N II] red.
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let composer, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
const TRANSITION_DURATION = 2200;

// Scene objects
let nebulaGroup;          // rotates the whole nebula
let centralStar;
let starLight;
let haloMat;              // for pulsation uniform

// Shell uniforms (for time animation)
let innerCavityUniforms;
let mainRingInnerUniforms;
let mainRingOuterUniforms;
let bipolarUniforms;
let outerHaloUniforms;

// Particles
let knotSystem, knotData;
let windSystem, windData;
const KNOT_COUNT = 800;
const WIND_COUNT = 300;

// Accumulated time (respects timeScale)
let accTime = 0;

// ─── Shared GLSL noise ─────────────────────────────────────
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
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.45;
    }
    return v;
  }
`;

const SHELL_VERTEX = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
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

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(20, 12, 28);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  clickableObjects = [];
  meshNameMap = new Map();
  accTime = 0;

  // Starfield
  new THREE.TextureLoader().load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  nebulaGroup = new THREE.Group();
  // Slight tilt to show ring structure at an angle
  nebulaGroup.rotation.x = 0.26; // ~15 degrees
  scene.add(nebulaGroup);

  buildCentralStar();
  buildInnerCavity();
  buildMainRingInner();
  buildMainRingOuter();
  buildBipolarLobes();
  buildOuterHalo();
  buildStellarWind();
  buildCometaryKnots();

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
  bloomPass.strength = 1.1;
  bloomPass.threshold = 0.55;
  bloomPass.radius = 0.6;
  cinematicPass.uniforms.liftR.value = 0.94;
  cinematicPass.uniforms.liftG.value = 1.02;
  cinematicPass.uniforms.liftB.value = 1.08;
  cinematicPass.uniforms.vignetteIntensity.value = 0.45;
}

// ═══════════════════════════════════════════
// Scene construction
// ═══════════════════════════════════════════

function buildCentralStar() {
  // Core white dwarf
  const coreGeo = new THREE.SphereGeometry(0.15, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.5, 0.55, 0.7),
  });
  centralStar = new THREE.Mesh(coreGeo, coreMat);
  nebulaGroup.add(centralStar);
  meshNameMap.set(centralStar, 'NGC 6543');
  clickableObjects.push(centralStar);

  // UV halo
  const glowGeo = new THREE.SphereGeometry(0.6, 32, 32);
  haloMat = new THREE.ShaderMaterial({
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
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 2.5) * 1.5;
        vec3 inner = vec3(0.55, 0.6, 0.8);
        vec3 outer = vec3(0.3, 0.4, 0.8);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, glow * 0.3 * pulse);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  nebulaGroup.add(new THREE.Mesh(glowGeo, haloMat));

  // Point light
  starLight = new THREE.PointLight(0xccddff, 0.8, 40);
  nebulaGroup.add(starLight);
}

function buildInnerCavity() {
  const geo = new THREE.SphereGeometry(4, 48, 48);
  innerCavityUniforms = { time: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: innerCavityUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        vec3 dir = normalize(vPosition);

        vec3 noisePos = dir * 4.0 + vec3(time * 0.01, time * -0.008, time * 0.006);
        float n = fbm(noisePos);
        float filament = 0.3 + 0.7 * smoothstep(0.2, 0.55, n);

        // Slight equatorial brightening
        float polar = abs(dir.y);
        float eqMask = 1.0 - smoothstep(0.0, 0.7, polar) * 0.3;

        // Hot [O III] blue-green
        vec3 color = vec3(0.15, 0.8, 0.7);

        float alpha = filament * eqMask * 0.35;
        alpha *= (0.6 + rim * 0.4);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  nebulaGroup.add(new THREE.Mesh(geo, mat));
}

function buildMainRingInner() {
  const geo = new THREE.SphereGeometry(10, 64, 64);
  mainRingInnerUniforms = { time: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: mainRingInnerUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        vec3 dir = normalize(vPosition);

        // Equatorial concentration — bright at equator, transparent at poles
        float polar = abs(dir.y);
        float ringMask = 1.0 - smoothstep(0.12, 0.5, polar);

        // Filament structure — use direction-based noise (not position-based)
        vec3 noisePos = dir * 5.0 + vec3(time * 0.01, time * -0.008, time * 0.007);
        float n = fbm(noisePos);
        float filament = 0.3 + 0.7 * smoothstep(0.15, 0.5, n);

        // Secondary detail
        float detail = fbm(dir * 8.0 + vec3(0.0, time * 0.012, 0.0));
        filament = max(filament, 0.3 + 0.5 * smoothstep(0.45, 0.7, detail));

        // Color: teal-green [O III] → pink H-alpha (noise-driven patches)
        float colorSeed = fbm(dir * 3.0 + vec3(88.0));
        vec3 teal = vec3(0.15, 0.8, 0.6);
        vec3 pink = vec3(0.9, 0.35, 0.45);
        vec3 cyan = vec3(0.3, 0.85, 0.75);
        vec3 color;
        if (colorSeed < 0.4) {
          color = mix(teal, cyan, smoothstep(0.15, 0.4, colorSeed));
        } else {
          color = mix(teal, pink, smoothstep(0.4, 0.8, colorSeed));
        }

        float alpha = filament * ringMask * 0.7;
        alpha *= (0.65 + rim * 0.35);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  nebulaGroup.add(new THREE.Mesh(geo, mat));
}

function buildMainRingOuter() {
  const geo = new THREE.SphereGeometry(14, 64, 64);
  mainRingOuterUniforms = { time: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: mainRingOuterUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        vec3 dir = normalize(vPosition);

        // Wider equatorial band than inner ring
        float polar = abs(dir.y);
        float ringMask = 1.0 - smoothstep(0.18, 0.55, polar);

        // Filament noise
        vec3 noisePos = dir * 4.0 + vec3(time * 0.008, time * 0.006, time * -0.007);
        float n = fbm(noisePos);
        float filament = 0.25 + 0.75 * smoothstep(0.2, 0.55, n);

        // Color: pink-red [N II] with patches of orange and deep red
        float colorSeed = fbm(dir * 3.0 + vec3(150.0));
        vec3 red = vec3(0.85, 0.2, 0.2);
        vec3 orange = vec3(0.9, 0.5, 0.15);
        vec3 deepRed = vec3(0.75, 0.1, 0.15);
        vec3 color;
        if (colorSeed < 0.35) {
          color = mix(deepRed, red, smoothstep(0.1, 0.35, colorSeed));
        } else {
          color = mix(red, orange, smoothstep(0.35, 0.8, colorSeed));
        }

        float alpha = filament * ringMask * 0.55;
        alpha *= (0.6 + rim * 0.4);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  nebulaGroup.add(new THREE.Mesh(geo, mat));
}

function buildBipolarLobes() {
  const geo = new THREE.SphereGeometry(11, 48, 48);
  bipolarUniforms = { time: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: bipolarUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        vec3 dir = normalize(vPosition);

        // Polar concentration — bright at poles, transparent at equator
        float polar = abs(dir.y);
        float lobeMask = smoothstep(0.2, 0.65, polar);

        // Diffuse FBM
        vec3 noisePos = dir * 4.0 + vec3(time * 0.008, time * -0.01, time * 0.005);
        float n = fbm(noisePos);
        float filament = 0.3 + 0.7 * smoothstep(0.25, 0.6, n);

        // Blue-purple → violet with patches
        float colorSeed = fbm(dir * 3.5 + vec3(200.0));
        vec3 blue = vec3(0.35, 0.3, 0.9);
        vec3 violet = vec3(0.65, 0.25, 0.8);
        vec3 color = mix(blue, violet, colorSeed);

        float alpha = filament * lobeMask * 0.45;
        alpha *= (0.55 + rim * 0.45);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(1, 1.8, 1); // elongate along Y for bipolar shape
  nebulaGroup.add(mesh);
}

function buildOuterHalo() {
  const geo = new THREE.SphereGeometry(22, 48, 48);
  outerHaloUniforms = { time: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: outerHaloUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        vec3 dir = normalize(vPosition);

        // Concentric ripples from previous mass-loss episodes
        // Use angular position (dir) for ring patterns
        float angularDist = acos(clamp(dir.y, -1.0, 1.0)) / 3.14159;
        float n = fbm(dir * 3.0 + vec3(time * 0.005));
        float ripple = sin(angularDist * 30.0 + n * 2.0) * 0.5 + 0.5;
        ripple = pow(ripple, 2.0); // sharpen the rings

        // Warm yellow-red
        vec3 color = vec3(0.8, 0.5, 0.2);
        color = mix(color, vec3(0.7, 0.3, 0.15), ripple * 0.3);

        float alpha = ripple * 0.12 + 0.03;
        alpha *= (0.4 + rim * 0.6);

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.12));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  nebulaGroup.add(new THREE.Mesh(geo, mat));
}

function buildStellarWind() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(WIND_COUNT * 3);
  const velocities = new Float32Array(WIND_COUNT * 3);
  const speeds = new Float32Array(WIND_COUNT);
  windData = { velocities, speeds };

  for (let i = 0; i < WIND_COUNT; i++) {
    // Random sphere direction
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.sin(phi) * Math.sin(theta);
    const dz = Math.cos(phi);

    // Start scattered through the inner cavity (r = 0.3–3.5)
    const r = 0.3 + Math.random() * 3.2;
    positions[i * 3]     = dx * r;
    positions[i * 3 + 1] = dy * r;
    positions[i * 3 + 2] = dz * r;

    velocities[i * 3]     = dx;
    velocities[i * 3 + 1] = dy;
    velocities[i * 3 + 2] = dz;

    speeds[i] = 3 + Math.random() * 5; // fast wind
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: makeSpriteTexture(180, 200, 255),
    size: 0.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  windSystem = new THREE.Points(geo, mat);
  nebulaGroup.add(windSystem);
}

function buildCometaryKnots() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(KNOT_COUNT * 3);
  knotData = [];

  for (let i = 0; i < KNOT_COUNT; i++) {
    const r = 5 + Math.random() * 9; // r = 5–14
    const angle = Math.random() * Math.PI * 2;
    // Low |y| to stay in equatorial region
    const y = (Math.random() - 0.5) * 4.0;

    positions[i * 3]     = Math.cos(angle) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    const speed = 0.3 / Math.pow(r, 0.8);
    knotData.push({ r, angle, speed, baseY: y });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: makeSpriteTexture(220, 140, 120),
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  knotSystem = new THREE.Points(geo, mat);
  nebulaGroup.add(knotSystem);
}

// ═══════════════════════════════════════════
// View API
// ═══════════════════════════════════════════

export function animate() {
  const ts = sim.timeScale;
  const dt = 0.016;
  const scaledDt = dt * ts;
  accTime += scaledDt;

  // Slow nebula rotation
  nebulaGroup.rotation.y += 0.06 * scaledDt;

  // Star pulsation (respects timeScale)
  const pulse = 1.0 + 0.12 * Math.sin(accTime * 1.5);
  starLight.intensity = 0.8 * pulse;
  haloMat.uniforms.pulse.value = pulse;

  // Update shell time uniforms (all use accumulated scaled time)
  innerCavityUniforms.time.value = accTime;
  mainRingInnerUniforms.time.value = accTime;
  mainRingOuterUniforms.time.value = accTime;
  bipolarUniforms.time.value = accTime;
  outerHaloUniforms.time.value = accTime;

  // Cometary knot particle orbits
  if (knotSystem) {
    const posAttr = knotSystem.geometry.getAttribute('position');
    const arr = posAttr.array;
    for (let i = 0; i < KNOT_COUNT; i++) {
      const pd = knotData[i];
      pd.angle += pd.speed * scaledDt;
      arr[i * 3]     = Math.cos(pd.angle) * pd.r;
      arr[i * 3 + 1] = pd.baseY;
      arr[i * 3 + 2] = Math.sin(pd.angle) * pd.r;
    }
    posAttr.needsUpdate = true;
  }

  // Stellar wind particles — radial outflow, reset at inner cavity boundary
  if (windSystem) {
    const wPos = windSystem.geometry.getAttribute('position');
    const wa = wPos.array;
    const vel = windData.velocities;
    const spd = windData.speeds;
    for (let i = 0; i < WIND_COUNT; i++) {
      const s = spd[i];
      wa[i * 3]     += vel[i * 3]     * s * scaledDt;
      wa[i * 3 + 1] += vel[i * 3 + 1] * s * scaledDt;
      wa[i * 3 + 2] += vel[i * 3 + 2] * s * scaledDt;

      // Reset when reaching inner cavity edge
      const px = wa[i * 3], py = wa[i * 3 + 1], pz = wa[i * 3 + 2];
      const dist = Math.sqrt(px * px + py * py + pz * pz);
      if (dist > 4.0) {
        const r = 0.2 + Math.random() * 0.3;
        wa[i * 3]     = vel[i * 3]     * r;
        wa[i * 3 + 1] = vel[i * 3 + 1] * r;
        wa[i * 3 + 2] = vel[i * 3 + 2] * r;
      }
    }
    wPos.needsUpdate = true;
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
  knotData = [];
  windData = null;
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
  return [{ name: 'NGC 6543', mesh: centralStar }];
}
