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

    varying vec2 vUv;

    #define MAX_STEPS 256
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
      for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.1; a *= 0.5; }
      return v;
    }

    // ── Disk color: temperature gradient + Doppler + turbulence ──
    // The disk lies in the XZ plane (y=0 in BH local coords).
    // rayDir is needed to compute angle-dependent optical depth:
    // a geometrically thin disk is nearly transparent face-on and opaque edge-on.
    vec4 diskColor(vec3 hitPos, vec3 rayDir){
      float r = length(hitPos.xz);
      if(r < diskInner || r > diskOuter) return vec4(0.0);

      float t = (r - diskInner)/(diskOuter - diskInner);  // 0=inner, 1=outer

      // Temperature: T ∝ r^(-3/4) (Novikov-Thorne thin disk)
      float temp = pow(max(1.0 - t*0.85, 0.01), 2.5);

      // Colour: hot white → warm orange → cool red
      vec3 cHot  = vec3(1.0, 0.92, 0.82);
      vec3 cWarm = vec3(0.85, 0.35, 0.06);
      vec3 cCool = vec3(0.22, 0.03, 0.005);
      vec3 col;
      if(t < 0.15) col = mix(cHot, cWarm, t/0.15);
      else col = mix(cWarm, cCool, (t-0.15)/0.85);

      // Doppler beaming (toned down à la Interstellar)
      float theta = atan(hitPos.z, hitPos.x);
      float beta = mix(0.22, 0.06, t);
      float cosA = cos(theta);
      float D = (1.0 + beta*cosA) / max(1.0 - beta*cosA, 0.01);
      float doppler = pow(D, 2.0);

      // Turbulence
      vec2 nc = vec2(theta*3.0 + time*0.04, r*0.3 - time*0.08);
      float turb = 0.55 + 0.45*fbm(nc);

      // Emission brightness
      float emission = temp * turb * doppler;

      // Optical depth: thin disk seen face-on → low τ, edge-on → high τ.
      float cosInc = abs(normalize(rayDir).y);
      float tau = 0.16 / max(cosInc, 0.04);
      tau *= (0.5 + 0.5*temp);

      float alpha = 1.0 - exp(-tau);

      // Soft radial edges
      alpha *= smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.7, t);

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

      for(int i = 0; i < MAX_STEPS; i++){
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
        float h = max(0.05, (r - RS) * 0.3);
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

  // Bloom — photon ring and inner disk glow
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    2.0, 0.7, 0.4,
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

export function animate() {
  const ts = sim.timeScale;

  // Update BH shader uniforms every frame (camera may have moved)
  updateBhUniforms();
  bhPass.uniforms.time.value += 0.016 * ts;

  if (focusTransition) {
    const elapsed = performance.now() - focusTransition.startTime;
    const t = Math.min(elapsed / focusTransition.duration, 1);
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
  if (bhPass) bhPass.uniforms.aspectRatio.value = camera.aspect;
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
