import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

/*
 * Black hole visualisation inspired by the Interstellar Gargantua render.
 *
 * Architecture:
 *  1. A background starfield is rendered normally via scene.background.
 *  2. A fullscreen ray-marching shader (BlackHoleShader) renders everything
 *     BH-related: shadow, photon ring, accretion disk (direct + lensed images),
 *     and gravitational lensing of the starfield. This runs as a ShaderPass that
 *     composites on top of the starfield render.
 *  3. Heavy bloom makes the photon ring and inner disk glow.
 *  4. A cinematic color-grade pass finishes it off.
 *
 * The ray-marching traces rays from the camera through each pixel, integrating
 * them through a Schwarzschild metric (in Boyer-Lindquist-like coordinates).
 * Each ray is stepped; at each step we check for disk intersection and
 * accumulate color. This naturally produces the lensed secondary and higher-order
 * images of the disk wrapping over/under the shadow — the iconic Interstellar look.
 */

let scene, camera, controls, renderer, camMove;
let composer, bhPass, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
let shadowSphere; // invisible sphere for raycasting
let flythroughState = null;
const TRANSITION_DURATION = 2200;

// ────────────────────────────────────────────
// Cinematic post shader (vignette + grain + color grade)
// ────────────────────────────────────────────
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignetteIntensity: { value: 0.55 },
    grainIntensity: { value: 0.04 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
      precision mediump float;
    uniform sampler2D tDiffuse;
    uniform float time, vignetteIntensity, grainIntensity;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // warm grade
      c.r *= 1.06; c.b *= 0.92;
      c.rgb = (c.rgb - 0.5)*1.12 + 0.5;
      // vignette
      float d = length(vUv - 0.5);
      c.rgb *= 1.0 - smoothstep(0.3, 0.85, d)*vignetteIntensity;
      // grain
      float g = rand(vUv + fract(time))*grainIntensity;
      c.rgb += g - grainIntensity*0.5;
      gl_FragColor = c;
    }
  `,
};

// ────────────────────────────────────────────
// Black hole ray-marching shader
// ────────────────────────────────────────────
// This is the core of the visualisation. It runs as a post-processing pass
// on top of the starfield render, ray-marching each pixel through curved
// spacetime to produce the shadow, photon ring, lensed disk images, and
// lensed starfield.
const BlackHoleShader = {
  uniforms: {
    tDiffuse:     { value: null },  // starfield render
    bhPos:        { value: new THREE.Vector3(0, 0, 0) },
    bhMass:       { value: 1.5 },   // Schwarzschild radius = 2*M
    diskInner:    { value: 4.5 },   // ISCO ≈ 3*r_s = 6M → we use ~4.5 for visual
    diskOuter:    { value: 20.0 },
    time:         { value: 0.0 },
    camPos:       { value: new THREE.Vector3() },
    camDir:       { value: new THREE.Vector3() },
    camUp:        { value: new THREE.Vector3() },
    camRight:     { value: new THREE.Vector3() },
    camFov:       { value: 0.8 },   // half-fov in radians
    aspectRatio:  { value: 1.0 },
    quality:      { value: 0.5 },  // 0 = low, 1 = ultra
    diskTilt:     { value: Math.PI * 0.08 },  // slight tilt so we see the disk
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
      precision mediump float;
    uniform sampler2D tDiffuse;
    uniform vec3  bhPos;
    uniform float bhMass;
    uniform float diskInner, diskOuter;
    uniform float time;
    uniform vec3  camPos, camDir, camUp, camRight;
    uniform float camFov, aspectRatio;
    uniform float diskTilt;
    uniform float quality;

    varying vec2 vUv;

    #define MAX_STEPS 6144
    #define RS (2.0 * bhMass)

    // ── Noise for disk turbulence ──
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                 mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      float maxIter = mix(2.0, 120.0, quality);
      for(int i=0;i<120;i++){
        if(float(i) >= maxIter) break;
        v += a*noise(p); p *= 2.1; a *= 0.5;
      }
      return v;
    }

    // ── Disk color: temperature gradient + Doppler + turbulence ──
    // Keplerian differential rotation: inner disk spins much faster than outer,
    // naturally creating shearing spiral arms. Designed to look like swirling
    // luminous clouds when viewed from above.
    vec4 diskColor(vec3 hitPos, vec3 rayDir){
      float r = length(hitPos.xz);
      if(r < diskInner || r > diskOuter) return vec4(0.0);

      float t = (r - diskInner)/(diskOuter - diskInner);  // 0=inner, 1=outer

      // Temperature: T ∝ r^(-3/4) (Novikov-Thorne thin disk)
      float temp = pow(max(1.0 - t*0.82, 0.01), 2.0);

      // Colour: vivid gold → saturated orange → deep red-brown
      vec3 cHot  = vec3(1.0, 0.85, 0.55);   // inner: bright saturated gold
      vec3 cWarm = vec3(0.92, 0.45, 0.08);   // mid: vivid orange
      vec3 cCool = vec3(0.50, 0.12, 0.02);   // outer: deep burnt sienna
      vec3 col;
      if(t < 0.2) col = mix(cHot, cWarm, t/0.2);
      else col = mix(cWarm, cCool, (t-0.2)/0.8);

      // Doppler beaming (toned down à la Interstellar)
      float theta = atan(hitPos.z, hitPos.x);
      float beta = mix(0.22, 0.06, t);
      float cosA = cos(theta);
      float D = (1.0 + beta*cosA) / max(1.0 - beta*cosA, 0.01);
      float doppler = pow(D, 2.0);

      // ── Keplerian differential rotation ──
      // ω ∝ r^(-3/2): inner disk orbits much faster → creates natural shear.
      float omega = 1.8 / pow(max(r, diskInner), 1.5);
      float rotAngle = theta + omega * time;

      // ── Spiral streamline coordinates ──
      // Sample noise along logarithmic spiral paths so cloud features
      // stretch continuously from outer to inner disk (material spiralling
      // inward), not as concentric rings.
      //
      // We convert (r, theta) into a coordinate system aligned with the
      // accretion flow.  "s" runs along spirals, "q" runs across them.
      float logR = log(max(r, 0.1));
      float s = rotAngle - logR * 2.5;   // along-spiral (flow direction)
      float q = logR;                      // cross-spiral (radial)

      // ── Multi-scale swirling cloud turbulence ──
      // ALL noise is FBM on (s, q) — no sine waves, so no rings.

      // Large-scale cloud structure: broad irregular bright/dark regions
      vec2 p1 = vec2(s, q) * 4.8;
      float large = fbm(p1);

      // Medium-scale cloud clumps
      vec2 p2 = vec2(s * 10.0, q * 11.0) + vec2(13.7, 7.3);
      float med = fbm(p2);

      // Fine-scale wisps and filaments
      vec2 p3 = vec2(s * 20.0, q * 22.0) + vec2(31.5, 19.1);
      float fine = fbm(p3);

      // Combine: large structure dominates, detail adds texture
      float turb = 0.15 + 0.45 * large + 0.28 * med + 0.12 * fine;

      // Inner disk: slightly more uniform (hotter, denser)
      // Outer disk: full cloud structure visible
      turb = mix(0.75, turb, smoothstep(0.0, 0.25, t));

      // Emission brightness
      float emission = temp * turb * doppler * 1.1;

      // Optical depth: solid opaque cloud layer from above
      float cosInc = abs(normalize(rayDir).y);
      float tau = 2.5 / max(cosInc, 0.2);
      tau *= (0.6 + 0.4 * temp);

      float alpha = 1.0 - exp(-tau);

      // Soft radial edges
      alpha *= smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.65, t);

      return vec4(col * emission, clamp(alpha, 0.0, 1.0));
    }

    void main(){
      // ── Build ray from camera ──
      vec2 uv = vUv * 2.0 - 1.0;
      uv.x *= aspectRatio;
      vec3 rd = normalize(camDir + uv.x * camFov * camRight + uv.y * camFov * camUp);
      vec3 ro = camPos;

      // ── Disk tilt: rotate the BH frame slightly so the disk isn't edge-on ──
      // We apply the tilt by rotating ro and rd into the BH's frame where the
      // disk is in the XZ plane. The tilt rotation is around the X axis.
      // (This is equivalent to tilting the disk.)

      // Ray-march through Schwarzschild geometry
      // Using the pseudo-Newtonian potential (Paczynski-Wiita-like) for deflection.
      // At each step: acceleration = -M/r² * rhat * (1 + 3*(L/r)²/c² )
      // We approximate the geodesic with leapfrog integration.

      vec3 pos = ro - bhPos;    // position relative to BH
      vec3 vel = rd;             // unit direction

      // Adaptive step sizing
      float totalDist = 0.0;
      float rMin = 1e10;

      vec4 accDisk = vec4(0.0);  // accumulated disk color
      bool hitShadow = false;
      float photonRingGlow = 0.0;

      // Initial speed
      float speed = 1.0;

      float maxSteps = mix(64.0, 6144.0, quality);
      for(int i = 0; i < MAX_STEPS; i++){
        if(float(i) >= maxSteps) break;
        float r = length(pos);
        if(r > 150.0) break;    // escaped

        rMin = min(rMin, r);

        // Event horizon: absorbed
        if(r < RS * 1.01){
          hitShadow = true;
          break;
        }

        // Photon ring contribution: very close to r = 1.5*RS
        // Only rays that graze the photon sphere spend many steps here,
        // so the accumulation naturally produces a thin bright ring.
        float photonR = 1.5 * RS;
        float photonDist = abs(r - photonR);
        if(photonDist < 0.2){
          float pr = exp(-photonDist * 20.0) * 0.025;
          photonRingGlow += pr;
        }

        // Step size: smaller near the BH for accuracy
        float minStep = mix(0.5, 0.003, quality);
        float h = max(minStep, (r - RS) * 0.3);
        h = min(h, 2.0);

        // Gravitational acceleration (Schwarzschild geodesic approx)
        // F = -M/r² * rhat, with relativistic correction factor
        vec3 rhat = pos / r;
        float r2 = r * r;

        // Angular momentum per unit mass squared
        vec3 L = cross(pos, vel);
        float L2 = dot(L, L);

        // Schwarzschild correction: extra 3*RS*L²/(2*r³) term
        float accelMag = bhMass / r2 * (1.0 + 1.5 * RS * L2 / (r2 * r));
        vec3 accel = -rhat * accelMag;

        // Leapfrog integration
        vec3 velHalf = vel + accel * h * 0.5;
        pos += velHalf * h;
        float rNew = length(pos);
        vec3 rhatNew = pos / rNew;
        float r2New = rNew * rNew;
        vec3 Lnew = cross(pos, velHalf);
        float L2new = dot(Lnew, Lnew);
        float accelMagNew = bhMass / r2New * (1.0 + 1.5 * RS * L2new / (r2New * rNew));
        vec3 accelNew = -rhatNew * accelMagNew;
        vel = velHalf + accelNew * h * 0.5;

        // ── Check disk intersection ──
        // Disk is in the y=0 plane. Check if we crossed y=0 during this step.
        float prevY = pos.y - velHalf.y * h;  // approximate previous y
        if(prevY * pos.y <= 0.0 && accDisk.a < 0.97){
          // Interpolate to find intersection point
          float frac = abs(prevY) / max(abs(prevY - pos.y), 0.0001);
          vec3 hitP = pos - velHalf * h * (1.0 - frac);
          vec4 dc = diskColor(hitP, vel);
          // Composite: back-to-front
          accDisk.rgb += dc.rgb * dc.a * (1.0 - accDisk.a);
          accDisk.a   += dc.a * (1.0 - accDisk.a);
        }

        totalDist += h;
      }

      // ── Compose final pixel ──
      vec4 bg = texture2D(tDiffuse, vUv);

      // Starfield lensing: for escaped rays, look up the deflected direction.
      // We project the final ray direction change into a UV offset.
      vec3 finalDir = normalize(vel);
      if(!hitShadow){
        if(rMin < 40.0){
          // Stronger lensing for rays that passed closer to the BH
          float lensStrength = smoothstep(40.0, 4.0, rMin) * 0.25;
          vec2 offset = (finalDir.xz - rd.xz) * lensStrength;
          vec2 lensedUV = clamp(vUv + offset, 0.001, 0.999);
          bg = texture2D(tDiffuse, lensedUV);
        }
      }

      vec3 result = bg.rgb;

      // Shadow: pure black
      if(hitShadow){
        result = vec3(0.0);
      }

      // Photon ring: the thin bright Einstein ring. Colour warm white,
      // intensity driven just above bloom threshold for a soft glow.
      vec3 photonCol = vec3(1.4, 1.2, 0.9);
      result += photonCol * min(photonRingGlow, 2.0);

      // Accretion disk composite (pre-multiplied alpha over background)
      result = result * (1.0 - accDisk.a) + accDisk.rgb;

      gl_FragColor = vec4(result, 1.0);
    }
  `,
};

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
  // Slightly above the disk plane for the classic Interstellar framing
  camera.position.set(0, 12, 50);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 8;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  // Starfield background
  const bgLoader = new THREE.TextureLoader();
  bgLoader.load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  // Invisible sphere for raycasting / clicking
  shadowSphere = new THREE.Mesh(
    new THREE.SphereGeometry(5, 16, 16),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  scene.add(shadowSphere);

  clickableObjects = [shadowSphere];
  meshNameMap = new Map();
  meshNameMap.set(shadowSphere, 'Black Hole');

  // ── Post-processing chain ──
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Black hole ray-marching pass
  bhPass = new ShaderPass(BlackHoleShader);
  updateBhUniforms();
  composer.addPass(bhPass);

  // Bloom — only the photon ring and very hottest inner disk edge glow.
  // High threshold keeps the swirl structure sharp and readable.
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4, 0.6, 0.7,
  );
  composer.addPass(bloomPass);

  // Cinematic color grade
  cinematicPass = new ShaderPass(CinematicShader);
  composer.addPass(cinematicPass);

  // ── Input ──
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
      if (cbHover) cbHover('Black Hole', event.clientX, event.clientY);
    } else {
      renderer.domElement.style.cursor = 'default';
      if (cbBlur) cbBlur();
    }
  };

  renderer.domElement.addEventListener('click', boundOnClick);
  renderer.domElement.addEventListener('mousemove', boundOnMouseMove);
}

function updateBhUniforms() {
  const u = bhPass.uniforms;
  u.aspectRatio.value = window.innerWidth / window.innerHeight;

  // Camera vectors
  camera.updateMatrixWorld();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const up = new THREE.Vector3().copy(camera.up).normalize();
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  // Recompute up to be orthogonal
  up.crossVectors(right, dir).normalize();

  u.camPos.value.copy(camera.position);
  u.camDir.value.copy(dir);
  u.camUp.value.copy(up);
  u.camRight.value.copy(right);
  u.camFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
}

// ── Interstellar descent flythrough ──
// Cinematic spiral descent from high above the accretion disk down toward
// the event horizon — inspired by Cooper's approach to Gargantua.
function buildDescentPath() {
  const points = [];
  const numPoints = 30;

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);

    // 2 full rotations
    const angle = t * Math.PI * 4;

    // Radius: 55 → 8, stays well outside the event horizon
    // Flattens out at the end for a tangential orbit rather than plunging in
    const radius = 8 + 47 * Math.pow(1 - t, 1.4);

    // Height: 25 → 0.4, drops faster than radius for the swooping effect
    const height = 0.4 + 24.6 * Math.pow(1 - t, 2.2);

    points.push(new THREE.Vector3(
      radius * Math.cos(angle),
      height,
      radius * Math.sin(angle),
    ));
  }

  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
}

export function startFlythrough(onComplete) {
  focusTransition = null;

  const curve = buildDescentPath();
  controls.enabled = false;

  flythroughState = {
    active: true,
    curve,
    startTime: performance.now(),
    duration: 35000,
    onComplete,
  };

  camera.position.copy(curve.getPoint(0));
  controls.target.set(0, 0, 0);
}

export function cancelFlythrough() {
  if (!flythroughState || !flythroughState.active) return;
  flythroughState.active = false;
  flythroughState = null;
  controls.enabled = true;
}

export function isFlythroughActive() {
  return flythroughState != null && flythroughState.active;
}

export function animate() {
  const ts = sim.timeScale;

  // Update BH shader uniforms every frame (camera may have moved)
  updateBhUniforms();
  bhPass.uniforms.time.value += 0.048 * ts;

  // Advance any active fired photon trajectories
  updatePhotons(0);

  // ── Flythrough descent ──
  if (flythroughState && flythroughState.active) {
    const elapsed = performance.now() - flythroughState.startTime;
    const rawT = Math.min(elapsed / flythroughState.duration, 1);

    // Ease-out: fast start (diving in), gradual slowdown near the disk
    const t = 1 - Math.pow(1 - rawT, 1.6);

    const curve = flythroughState.curve;
    camera.position.copy(curve.getPoint(t));

    // Look tangential to the black hole surface:
    // Blend between the flight-path tangent and a slight inward pull
    // so the camera grazes past rather than staring at the center
    const tangent = curve.getTangent(t).normalize();
    const toCenter = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize();
    // Early: mostly tangent; later: more tangent with a slight inward bias
    const inwardBias = 0.15 + 0.1 * (1 - rawT);
    const lookDir = tangent.clone().lerp(toCenter, inwardBias).normalize();
    const lookTarget = camera.position.clone().add(lookDir.multiplyScalar(10));
    controls.target.lerp(lookTarget, 0.06);
    camera.lookAt(controls.target);

    if (rawT >= 1) {
      const cb = flythroughState.onComplete;
      flythroughState.active = false;
      flythroughState = null;
      controls.enabled = true;
      controls.target.set(0, 0, 0);
      if (cb) cb();
    }
  } else if (focusTransition) {
    const elapsed = performance.now() - focusTransition.startTime;
    const t = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startTarget, focusTransition.endTarget, ease);
    camera.position.lerpVectors(focusTransition.startCam, focusTransition.endCam, ease);
    if (t >= 1) focusTransition = null;
  }

  if (!flythroughState || !flythroughState.active) {
    camMove.update(0.016);
    controls.update();
  }
  cinematicPass.uniforms.time.value = performance.now() / 1000;
  composer.render();
}

export function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(window.innerWidth, window.innerHeight);
  if (bhPass) bhPass.uniforms.aspectRatio.value = camera.aspect;
}

export function dispose() {
  renderer.domElement.removeEventListener('click', boundOnClick);
  renderer.domElement.removeEventListener('mousemove', boundOnMouseMove);
  renderer.domElement.style.cursor = 'default';
  focusTransition = null;
  flythroughState = null;
  camMove.dispose();
  scene.clear();
}

export function setQuality(q) {
  if (bhPass) bhPass.uniforms.quality.value = q;
}

export function setDiskTilt(radians) {
  if (bhPass) bhPass.uniforms.diskTilt.value = radians;
}

// ─── Click-to-fire photon ───────────────────────────────────────────────────
// Integrates a photon trajectory through a Newtonian approximation of the
// Schwarzschild deflection and renders it as an additively-blended line
// that streaks through the scene. Visual only, but physically motivated.

const activePhotons = [];
const PHOTON_C = 30;              // "speed of light" in units/sec (visual)
const R_S = 2;                    // Schwarzschild radius of the BH (visual)
const PHOTON_STEPS = 200;

function integrateGeodesic(impactParam, color) {
  // Shoot a photon from (-40, 0, impactParam) toward +X
  // Integrate its position under Newtonian deflection
  // Use modified force: a = 1.5 r_s c² / r² (GR weak-field correction factor)
  const pos = new THREE.Vector3(-40, 0, impactParam);
  const vel = new THREE.Vector3(1, 0, 0);
  const dt = 0.08;
  const M = 1.5 * R_S * R_S;  // strength factor

  const positions = [];
  for (let i = 0; i < PHOTON_STEPS; i++) {
    positions.push(pos.clone());
    const r2 = pos.x * pos.x + pos.y * pos.y + pos.z * pos.z;
    const r = Math.sqrt(r2);
    if (r < R_S * 1.5) break;  // captured
    if (pos.x > 40 || pos.x < -45 || Math.abs(pos.z) > 40) break;  // escaped

    // Acceleration toward the BH, inverse square
    const ax = -pos.x * M / (r2 * r);
    const ay = -pos.y * M / (r2 * r);
    const az = -pos.z * M / (r2 * r);
    vel.x += ax * dt; vel.y += ay * dt; vel.z += az * dt;
    // Re-normalize to constant photon speed (c)
    const vmag = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    vel.multiplyScalar(1 / vmag);
    pos.addScaledVector(vel, dt * PHOTON_C);
  }

  return positions;
}

export function firePhoton() {
  if (!scene) return;
  // Random impact parameter each fire — ± a range, biased away from direct hit
  const sign = Math.random() > 0.5 ? 1 : -1;
  const b = sign * (R_S * (2.0 + Math.random() * 5));  // 2-7 Schwarzschild radii

  // Colors vary to add variety
  const hues = [0x60d0ff, 0xffa840, 0x80ff80, 0xff80c0, 0xffffff];
  const color = hues[Math.floor(Math.random() * hues.length)];

  const points = integrateGeodesic(b, color);
  if (points.length < 2) return;

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 100;
  scene.add(line);

  // Animate: reveal the line progressively, then fade out
  activePhotons.push({
    line,
    mat,
    count: points.length,
    revealProgress: 0,
    fadeProgress: 0,
    startTime: performance.now() * 0.001,
  });
}

function updatePhotons(dt) {
  for (let i = activePhotons.length - 1; i >= 0; i--) {
    const p = activePhotons[i];
    const elapsed = performance.now() * 0.001 - p.startTime;
    // Reveal over 0.6s
    if (p.revealProgress < 1) {
      p.revealProgress = Math.min(1, elapsed / 0.6);
      const visible = Math.floor(p.revealProgress * p.count);
      p.line.geometry.setDrawRange(0, Math.max(2, visible));
    }
    // Start fading after 2s
    if (elapsed > 2.0) {
      const fadeT = (elapsed - 2.0) / 1.2;
      p.mat.opacity = Math.max(0, 1 - fadeT);
      if (fadeT >= 1) {
        scene.remove(p.line);
        p.line.geometry.dispose();
        p.mat.dispose();
        activePhotons.splice(i, 1);
      }
    }
  }
}

export function focusOn(mesh) {
  const target = new THREE.Vector3(0, 0, 0);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = target.clone().add(dir.multiplyScalar(25));

  if (cbFocus) cbFocus('Black Hole');

  focusTransition = {
    startCam: camera.position.clone(),
    endCam,
    startTarget: controls.target.clone(),
    endTarget: target,
    startTime: performance.now(),
    duration: TRANSITION_DURATION,
  };
}

export function getObjects() {
  return [{ name: 'Black Hole', mesh: shadowSphere }];
}
