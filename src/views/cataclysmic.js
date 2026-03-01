import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// Cataclysmic variable binary: Red giant + White dwarf
// Mass transfer via Roche-lobe overflow, accretion disk, stream
// Inspired by T Coronae Borealis / RS Ophiuchi
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let composer, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
const TRANSITION_DURATION = 2200;

// ── Binary parameters ──
const BINARY_SEP = 26;
const M_RG = 0.8, M_WD = 1.2;
const TOTAL_M = M_RG + M_WD;
const RG_DIST = BINARY_SEP * M_WD / TOTAL_M;  // ~15.6 from barycenter
const WD_DIST = BINARY_SEP * M_RG / TOTAL_M;  // ~10.4 from barycenter
const RG_RADIUS = 5.5;
const WD_RADIUS = 0.35;
const DISK_IN = WD_RADIUS * 3.0;
const DISK_OUT = 4.0;
const ORBIT_PERIOD = 50; // seconds per orbit at 1x

let binaryGroup, binaryAngle = 0;
let rgMesh, wdMesh;
let accDiskMat;
let streamCurve;
let streamGeo, streamPositionAttr, streamColorAttr, streamAlphaAttr;
let particleData = [];
const N_PARTICLES = 4000;

// ── Accretion disk shader ──
const DiskShader = {
  vertexShader: `
    varying vec2 vPolar;
    void main() {
      vPolar = vec2(length(position.xz), atan(position.z, position.x));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
      precision mediump float;
    uniform float innerR, outerR, time;
    varying vec2 vPolar;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                 mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }

    void main() {
      float r = vPolar.x, theta = vPolar.y;
      float t = clamp((r - innerR) / (outerR - innerR), 0.0, 1.0);

      // Temperature: hot inner → cool outer
      float temp = pow(max(1.0 - t * 0.8, 0.01), 2.2);

      // Colour: blue-white → yellow → orange
      vec3 cHot  = vec3(0.85, 0.88, 1.0);
      vec3 cMid  = vec3(1.0, 0.80, 0.45);
      vec3 cCool = vec3(0.85, 0.30, 0.05);
      vec3 col = t < 0.3 ? mix(cHot, cMid, t / 0.3)
                          : mix(cMid, cCool, (t - 0.3) / 0.7);

      // Spiral arms + turbulence
      float spiral = sin(theta * 3.0 - r * 1.2 + time * 0.8) * 0.5 + 0.5;
      vec2 nc = vec2(theta * 2.5 - time * 0.2 + r * 0.6, r * 0.4 + time * 0.05);
      float turb = 0.45 + 0.35 * noise(nc) + 0.2 * spiral;

      float brightness = temp * turb * 1.8;
      float alpha = brightness * smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.6, t);

      gl_FragColor = vec4(col * brightness, clamp(alpha, 0.0, 1.0));
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
  camera.position.set(0, 20, 55);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 8;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  clickableObjects = [];
  meshNameMap = new Map();
  binaryAngle = 0;

  // Starfield
  new THREE.TextureLoader().load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  // ── Binary group: everything orbits together ──
  binaryGroup = new THREE.Group();
  scene.add(binaryGroup);

  buildRedGiant();
  buildWhiteDwarf();
  buildAccretionDisk();
  buildStreamCurve();
  buildStreamTube();
  buildStreamParticles();
  buildHotSpot();

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0x120a18, 1.0));

  // ── Post-processing ──
  const post = createComposer(renderer, scene, camera);
  composer = post.composer;
  bloomPass = post.bloomPass;
  cinematicPass = post.cinematicPass;
  bloomPass.strength = 0.75;
  bloomPass.threshold = 0.62;
  bloomPass.radius = 0.55;
  cinematicPass.uniforms.liftR.value = 1.02;
  cinematicPass.uniforms.liftG.value = 0.95;
  cinematicPass.uniforms.liftB.value = 1.06;
  cinematicPass.uniforms.vignetteIntensity.value = 0.45;

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
      const name = meshNameMap.get(hits[0].object);
      if (name && cbHover) cbHover(name, event.clientX, event.clientY);
    } else {
      renderer.domElement.style.cursor = 'default';
      if (cbBlur) cbBlur();
    }
  };

  renderer.domElement.addEventListener('click', boundOnClick);
  renderer.domElement.addEventListener('mousemove', boundOnMouseMove);
}

// ═══════════════════════════════════════════
// Scene construction helpers
// ═══════════════════════════════════════════

function buildRedGiant() {
  // Core sphere — custom shader samples sun.jpg for granulation detail,
  // remaps luminance to red-giant colors, and adds limb darkening.
  const rgTex = new THREE.TextureLoader().load('/textures/sun.jpg');
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      sunTex: { value: rgTex },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal  = normalize(normalMatrix * normal);
        vec4 mv  = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D sunTex;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        // Sample the solar surface texture for granulation detail
        vec3 s = texture2D(sunTex, vUv).rgb;

        // Extract luminance — this captures bright granule centres vs dark lane boundaries
        float lum = dot(s, vec3(0.299, 0.587, 0.114));

        // Remap luminance to red-giant palette:
        //   bright granules  → warm orange-red
        //   dark lane edges  → deep burgundy
        vec3 bright = vec3(1.00, 0.42, 0.10);
        vec3 mid    = vec3(0.78, 0.18, 0.04);
        vec3 dark   = vec3(0.42, 0.06, 0.01);
        vec3 col = lum > 0.55
          ? mix(mid,    bright, (lum - 0.55) / 0.45)
          : mix(dark,   mid,    lum / 0.55);

        // Limb darkening: edges of the star are cooler and darker
        float cosA    = max(dot(vNormal, vViewDir), 0.0);
        float limb    = 0.4 + 0.6 * cosA;   // darkens toward rim
        col *= limb;

        // Slight emissive lift so the star glows even in shadow
        col += vec3(0.12, 0.02, 0.00);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  rgMesh = new THREE.Mesh(new THREE.SphereGeometry(RG_RADIUS, 64, 48), mat);
  rgMesh.position.set(-RG_DIST, 0, 0);
  binaryGroup.add(rgMesh);
  meshNameMap.set(rgMesh, 'Red Giant');
  clickableObjects.push(rgMesh);

  // Atmosphere: rim-lit shell
  const atmoMat = new THREE.ShaderMaterial({
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
        float g = pow(rim, 2.5) * 1.8;
        gl_FragColor = vec4(1.0, 0.3, 0.05, g * 0.55);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RG_RADIUS * 1.15, 48, 32), atmoMat);
  atmo.position.copy(rgMesh.position);
  binaryGroup.add(atmo);

  // Roche-lobe distortion: a stretched atmosphere envelope toward the WD.
  // Vertex shader displaces vertices on the WD-facing side outward.
  const rocheMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal, vViewDir;
      void main() {
        vec3 pos = position;
        // Stretch +X vertices (toward WD in binaryGroup local frame)
        float toward = max(pos.x, 0.0) / ${RG_RADIUS.toFixed(1)};
        pos.x += toward * toward * ${(RG_RADIUS * 0.55).toFixed(1)};
        float narrow = 1.0 - toward * 0.35;
        pos.y *= narrow;
        pos.z *= narrow;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3 vNormal, vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float g = pow(rim, 3.0) * 1.0;
        gl_FragColor = vec4(1.0, 0.35, 0.08, g * 0.3);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const roche = new THREE.Mesh(new THREE.SphereGeometry(RG_RADIUS * 1.08, 48, 32), rocheMat);
  roche.position.copy(rgMesh.position);
  binaryGroup.add(roche);

  // Point light
  const light = new THREE.PointLight(0xff5533, 2.5, 80);
  light.position.copy(rgMesh.position);
  binaryGroup.add(light);
}

function buildWhiteDwarf() {
  const mat = new THREE.MeshPhongMaterial({
    color: 0xdde8ff, emissive: 0x8899cc, emissiveIntensity: 0.6, shininess: 80,
  });
  wdMesh = new THREE.Mesh(new THREE.SphereGeometry(WD_RADIUS, 32, 24), mat);
  wdMesh.position.set(WD_DIST, 0, 0);
  binaryGroup.add(wdMesh);
  meshNameMap.set(wdMesh, 'White Dwarf');
  clickableObjects.push(wdMesh);

  // Tight glow — softer, doesn't overwhelm the accretion disk
  const glowMat = new THREE.ShaderMaterial({
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
        float g = pow(rim, 2.5) * 1.5;
        gl_FragColor = vec4(0.7, 0.82, 1.0, g * 0.22);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(WD_RADIUS * 2.2, 24, 16), glowMat);
  glow.position.copy(wdMesh.position);
  binaryGroup.add(glow);

  // Point light — toned down so the disk structure is visible
  const light = new THREE.PointLight(0xccddff, 1.8, 35);
  light.position.copy(wdMesh.position);
  binaryGroup.add(light);
}

function buildAccretionDisk() {
  accDiskMat = new THREE.ShaderMaterial({
    vertexShader: DiskShader.vertexShader,
    fragmentShader: DiskShader.fragmentShader,
    uniforms: {
      innerR: { value: DISK_IN },
      outerR: { value: DISK_OUT },
      time:   { value: 0 },
    },
    transparent: true, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const geo = new THREE.RingGeometry(DISK_IN, DISK_OUT, 128, 32);
  const disk = new THREE.Mesh(geo, accDiskMat);
  disk.rotation.x = -Math.PI / 2;
  disk.position.set(WD_DIST, 0, 0);
  binaryGroup.add(disk);
}

function buildStreamCurve() {
  // Mass transfer stream: L1 → curves past WD → wraps into disk.
  // Coriolis force in the co-rotating frame curves the stream.
  const l1x = -RG_DIST + RG_RADIUS * 1.02;  // just off RG surface
  const wdx = WD_DIST;

  const points = [
    new THREE.Vector3(l1x,                    0,  0),
    new THREE.Vector3(l1x + 5,                0, -1.0),
    new THREE.Vector3((l1x + wdx) * 0.4,      0, -3.2),
    new THREE.Vector3(wdx - 4,                0, -4.5),
    new THREE.Vector3(wdx - 0.5,              0, -DISK_OUT - 1.0),
    new THREE.Vector3(wdx + DISK_OUT * 0.85,  0, -DISK_OUT * 0.4),
    new THREE.Vector3(wdx + DISK_OUT * 0.55,  0,  0.5),
  ];
  streamCurve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

function buildStreamTube() {
  // Tapered glowing tube — wide cone at L1 departure, narrows to a tight stream
  const tubeSeg = 120, radSeg = 12, baseR = 0.65;
  const geo = new THREE.TubeGeometry(streamCurve, tubeSeg, baseR, radSeg, false);

  // Aggressive taper: ~4x wide at RG → ~0.2x near WD (12:1 cone ratio)
  const pos = geo.attributes.position.array;
  const vertsPerRing = radSeg + 1;
  for (let s = 0; s <= tubeSeg; s++) {
    const t = s / tubeSeg;
    // Ease out: rapid narrowing early, slow at the end
    const scale = 4.0 * Math.pow(1.0 - t * 0.95, 1.6);
    const center = streamCurve.getPointAt(t);
    for (let r = 0; r <= radSeg; r++) {
      const idx = (s * vertsPerRing + r) * 3;
      pos[idx]     = center.x + (pos[idx]     - center.x) * scale;
      pos[idx + 1] = center.y + (pos[idx + 1] - center.y) * scale;
      pos[idx + 2] = center.z + (pos[idx + 2] - center.z) * scale;
    }
  }
  geo.attributes.position.needsUpdate = true;
  // Don't recompute normals — the original TubeGeometry normals (radially
  // outward) are correct; recomputing after aggressive taper produces
  // degenerate normals that make the tube render as a dark solid cone.

  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal, vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      varying vec3 vNormal, vViewDir;
      void main() {
        float t = vUv.x; // 0 = near RG, 1 = near WD

        // Colour: deep red/orange → yellow-white
        vec3 col = mix(vec3(1.0, 0.30, 0.05), vec3(1.0, 0.85, 0.65), t);

        // Rim lighting for gaseous look
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 1.5) * 1.3 + 0.25;

        // Fade at start (smooth departure from RG surface) and end
        float taper = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.88, t);

        // Output premultiplied color — blending is ONE+ONE so alpha is unused
        gl_FragColor = vec4(col * glow * taper * 0.28, 1.0);
      }
    `,
    transparent: true, side: THREE.DoubleSide,
    depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });

  binaryGroup.add(new THREE.Mesh(geo, mat));
}

function buildStreamParticles() {
  streamGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(N_PARTICLES * 3);
  const colors    = new Float32Array(N_PARTICLES * 3);
  const alphas    = new Float32Array(N_PARTICLES);

  particleData = [];
  for (let i = 0; i < N_PARTICLES; i++) {
    particleData.push({
      progress: Math.random(),
      speed: 0.18 + Math.random() * 0.14,
      offY: (Math.random() - 0.5) * 2,
      offZ: (Math.random() - 0.5) * 2,
    });
    positions[i * 3] = positions[i * 3 + 1] = positions[i * 3 + 2] = 0;
    colors[i * 3] = 1; colors[i * 3 + 1] = 0.4; colors[i * 3 + 2] = 0.1;
    alphas[i] = 0;
  }

  streamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  streamGeo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
  streamGeo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1));
  streamPositionAttr = streamGeo.getAttribute('position');
  streamColorAttr    = streamGeo.getAttribute('aColor');
  streamAlphaAttr    = streamGeo.getAttribute('aAlpha');

  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute vec3  aColor;
      attribute float aAlpha;
      varying vec3  vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.5, 30.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3  vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float soft = 1.0 - smoothstep(0.0, 1.0, d);
        gl_FragColor = vec4(vColor, vAlpha * soft);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  binaryGroup.add(new THREE.Points(streamGeo, mat));
}

function buildHotSpot() {
  // Bright point where the stream impacts the outer disk edge
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.0, 1.6, 1.0), transparent: true, opacity: 0.65,
  });
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), mat);
  // Impact point: outer edge of disk on the stream-arrival side
  const impactPt = streamCurve.getPointAt(0.92);
  spot.position.copy(impactPt);
  binaryGroup.add(spot);

  // Glow around hot spot
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.4, 1.0, 0.5), transparent: true, opacity: 0.25,
  });
  const spotGlow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), glowMat);
  spotGlow.position.copy(impactPt);
  binaryGroup.add(spotGlow);
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function updateStream(dt) {
  const pos = streamPositionAttr.array;
  const col = streamColorAttr.array;
  const alp = streamAlphaAttr.array;

  for (let i = 0; i < N_PARTICLES; i++) {
    const p = particleData[i];
    p.progress += p.speed * dt;
    if (p.progress > 1) {
      p.progress -= 1;
      p.offY = (Math.random() - 0.5) * 2;
      p.offZ = (Math.random() - 0.5) * 2;
    }
    const t = p.progress;
    const pt = streamCurve.getPointAt(t);

    // Spread matches the cone: very wide at L1, converges tightly toward disk
    const spread = 3.5 * Math.pow(Math.max(1.0 - t * 0.95, 0.04), 1.6);
    pos[i * 3]     = pt.x;
    pos[i * 3 + 1] = pt.y + p.offY * spread;
    pos[i * 3 + 2] = pt.z + p.offZ * spread;

    // Color: red/orange near RG → yellow-white near WD
    col[i * 3]     = 1.0;
    col[i * 3 + 1] = 0.28 + t * 0.55;
    col[i * 3 + 2] = 0.04 + t * 0.60;

    // Alpha: fade in quickly, sustain, slight fade at end
    alp[i] = 0.22 * smoothstep(0.0, 0.06, t) * (0.65 + 0.35 * (1.0 - t));
  }

  streamPositionAttr.needsUpdate = true;
  streamColorAttr.needsUpdate = true;
  streamAlphaAttr.needsUpdate = true;
}

// ═══════════════════════════════════════════
// View API
// ═══════════════════════════════════════════

export function animate() {
  const dt = 0.016 * sim.timeScale;

  // Binary orbital motion
  binaryAngle += (2 * Math.PI / ORBIT_PERIOD) * dt;
  binaryGroup.rotation.y = binaryAngle;

  // Accretion disk animation
  if (accDiskMat) accDiskMat.uniforms.time.value += dt * 2.0;

  // Stream particles
  updateStream(dt);

  // Focus transition
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
}

export function dispose() {
  renderer.domElement.removeEventListener('click', boundOnClick);
  renderer.domElement.removeEventListener('mousemove', boundOnMouseMove);
  renderer.domElement.style.cursor = 'default';
  focusTransition = null;
  camMove.dispose();
  particleData = [];
  scene.clear();
}

export function focusOn(mesh) {
  const name = meshNameMap.get(mesh);
  const target = mesh.getWorldPosition(new THREE.Vector3());
  const dist = name === 'Red Giant' ? 22 : 12;
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = target.clone().add(dir.multiplyScalar(dist));

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
  return [
    { name: 'Red Giant',   mesh: rgMesh },
    { name: 'White Dwarf',  mesh: wdMesh },
  ];
}
