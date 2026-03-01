import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// HL Tauri — Protoplanetary Disk
// A young T Tauri star (~1 Myr) surrounded by a forming planetary system.
// ALMA 2015 observations revealed 5+ concentric gaps in the dust disk,
// strong evidence of planet formation carving material out of the disk.
// Bipolar jets (HH 150/151) extend along the polar axis.
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let composer, bloomPass, cinematicPass;
let raycaster, mouse, clickableObjects, focusTransition;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
const TRANSITION_DURATION = 2200;

// Scene objects
let starMesh;
let diskUniforms;
let jetUniforms;
let protoplanets = []; // { mesh, angle, radius, speed, name }
let particleSystem, particleData;
const PARTICLE_COUNT = 1500;

// Disk parameters
const DISK_INNER = 1.2;
const DISK_OUTER = 40;

// HL Tauri gap positions (normalized 0-1 across disk extent)
// Based on ALMA observations: gaps at ~13, 32, 42, 58, 70 AU in a ~100 AU disk
const GAPS = [
  { pos: 0.13, width: 0.025, depth: 0.80 },
  { pos: 0.28, width: 0.035, depth: 0.85 },
  { pos: 0.42, width: 0.030, depth: 0.75 },
  { pos: 0.58, width: 0.028, depth: 0.70 },
  { pos: 0.72, width: 0.032, depth: 0.82 },
];

// ─── Disk shader ──────────────────────────────────────────────
const DiskShader = {
  vertexShader: `
    varying vec2 vPolar;
    void main() {
      // RingGeometry lives in XY plane — use position.xy for polar coords
      vPolar = vec2(length(position.xy), atan(position.y, position.x));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
      precision mediump float;
    uniform float innerR, outerR, time;
    varying vec2 vPolar;

    // Gap uniforms
    const int NUM_GAPS = 5;
    uniform float gapPos[5];
    uniform float gapWidth[5];
    uniform float gapDepth[5];

    // ── Noise ──
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.1;
        a *= 0.48;
      }
      return v;
    }

    void main() {
      float r = vPolar.x, theta = vPolar.y;
      float t = clamp((r - innerR) / (outerR - innerR), 0.0, 1.0);

      // ── Temperature: T ∝ r^(-3/4) ──
      float temp = pow(max(1.0 - t * 0.85, 0.01), 1.5);

      // ── Color: gold inner → orange mid → dark brown outer ──
      vec3 cHot  = vec3(1.0, 0.82, 0.45);   // bright amber-gold
      vec3 cWarm = vec3(0.85, 0.40, 0.10);   // warm orange
      vec3 cMid  = vec3(0.50, 0.18, 0.05);   // brown
      vec3 cCool = vec3(0.18, 0.07, 0.03);   // very dark brown

      vec3 col;
      if (t < 0.15)      col = mix(cHot, cWarm, t / 0.15);
      else if (t < 0.4)  col = mix(cWarm, cMid, (t - 0.15) / 0.25);
      else                col = mix(cMid, cCool, (t - 0.4) / 0.6);

      // ── Keplerian differential rotation ──
      float omega = 1.2 / pow(max(r, innerR), 1.5);
      float rotAngle = theta + omega * time;

      // ── Logarithmic spiral coordinates ──
      float logR = log(max(r, 0.1));
      float s = rotAngle - logR * 2.0;  // along-spiral
      float q = logR;                    // cross-spiral

      // ── Multi-scale FBM dust turbulence ──
      float large = fbm(vec2(s, q) * 3.5);
      float med   = fbm(vec2(s * 8.0, q * 9.0) + vec2(13.7, 7.3));
      float fine  = fbm(vec2(s * 16.0, q * 17.0) + vec2(31.5, 19.1));

      float turb = 0.20 + 0.40 * large + 0.25 * med + 0.10 * fine;
      // Inner disk slightly more uniform (hotter, denser)
      turb = mix(0.65, turb, smoothstep(0.0, 0.15, t));

      // ── Gap carving ──
      float gapMask = 1.0;
      for (int i = 0; i < NUM_GAPS; i++) {
        float g = exp(-pow((t - gapPos[i]) / gapWidth[i], 2.0));
        gapMask *= 1.0 - gapDepth[i] * g;
      }

      // ── Bright ring edges ──
      float edgeBright = 0.0;
      for (int i = 0; i < NUM_GAPS; i++) {
        float dist = abs(t - gapPos[i]);
        float edge = smoothstep(gapWidth[i] * 2.5, gapWidth[i] * 1.0, dist);
        float inner = smoothstep(gapWidth[i] * 0.5, gapWidth[i] * 1.5, dist);
        edgeBright += edge * inner * 0.08;
      }

      // ── Emission brightness ──
      float emission = temp * turb * 0.7 + edgeBright;

      // ── Alpha ──
      float alpha = (0.4 + temp * 0.6) * turb * gapMask;
      alpha *= smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.85, t);
      alpha = clamp(alpha, 0.0, 0.92);

      gl_FragColor = vec4(col * emission * gapMask, alpha);
    }
  `,
};

// ─── Jet shader ───────────────────────────────────────────────
const JetShader = {
  vertexShader: `
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
  `,
  fragmentShader: `
      precision mediump float;
    uniform float time;
    uniform float jetSign; // +1 or -1
    varying vec3 vPos;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    float hash3(vec3 p) {
      p = fract(p * vec3(443.897, 441.423, 437.195));
      p += dot(p, p.yzx + 19.19);
      return fract((p.x + p.y) * p.z);
    }
    float noise3(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
            mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
            mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm3(vec3 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise3(p);
        p *= 2.1;
        a *= 0.45;
      }
      return v;
    }

    void main() {
      // Height along jet (0 = tip/narrow, 1 = base/wide)
      // ConeGeometry: tip at +height/2, base at -height/2
      // So y ranges from -25 (base) to +25 (tip) for height=50
      float h = (-vPos.y + 25.0) / 50.0; // 0 at tip, 1 at base

      // Distance from jet axis
      float axialDist = length(vPos.xz);
      float maxWidth = h * 50.0 * tan(radians(8.0));
      float radialT = axialDist / max(maxWidth, 0.01);

      // Rim lighting for 3D volume
      float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

      // FBM knotty structure — Herbig-Haro shocks
      vec3 noisePos = vec3(vPos.x * 0.5, vPos.y * 0.08 + time * jetSign * 0.3, vPos.z * 0.5);
      float knots = fbm3(noisePos);

      // Periodic brightness knots (shock regions)
      float shockKnot = pow(sin(h * 12.0 + time * 0.5) * 0.5 + 0.5, 3.0) * 0.4;

      // Base color: blue-white with slight variation
      vec3 baseCol = vec3(0.5, 0.65, 1.0);
      vec3 knotCol = vec3(0.8, 0.9, 1.0);
      vec3 col = mix(baseCol, knotCol, knots * 0.5 + shockKnot);

      // Opacity: falls off with height and distance from axis
      float alpha = (0.35 + knots * 0.3 + shockKnot);
      alpha *= smoothstep(1.0, 0.3, radialT);    // soft radial edge
      alpha *= smoothstep(0.0, 0.05, h);          // fade at base
      alpha *= smoothstep(1.0, 0.7, h);           // fade at tip
      alpha *= (0.3 + rim * 0.7);                 // rim enhancement
      alpha *= 0.45;

      gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
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
  camera.position.set(25, 20, 35);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 200;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  clickableObjects = [];
  meshNameMap = new Map();
  protoplanets = [];

  // Starfield
  new THREE.TextureLoader().load('/textures/starfield.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
  });

  buildStar();
  buildDisk();
  buildScatterHaze();
  buildProtoplanets();
  buildJets();
  buildDustEnvelope();
  buildParticles();

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0x0a0806, 0.5));

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

  // ── Post-processing ──
  const post = createComposer(renderer, scene, camera);
  composer = post.composer;
  bloomPass = post.bloomPass;
  cinematicPass = post.cinematicPass;
  bloomPass.strength = 0.7;
  bloomPass.threshold = 0.6;
  bloomPass.radius = 0.45;
  // Warm color grade for dusty protoplanetary palette
  cinematicPass.uniforms.liftR.value = 1.05;
  cinematicPass.uniforms.liftG.value = 0.98;
  cinematicPass.uniforms.liftB.value = 0.92;
  cinematicPass.uniforms.vignetteIntensity.value = 0.5;
}

// ═══════════════════════════════════════════
// Scene construction
// ═══════════════════════════════════════════

function buildStar() {
  // T Tauri star core
  const starGeo = new THREE.SphereGeometry(0.5, 32, 32);
  const starMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.9, 0.65),
  });
  starMesh = new THREE.Mesh(starGeo, starMat);
  scene.add(starMesh);
  meshNameMap.set(starMesh, 'HL Tauri');
  clickableObjects.push(starMesh);

  // Glow halo
  const glowGeo = new THREE.SphereGeometry(1.5, 32, 32);
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
        float glow = pow(rim, 2.0) * 1.8;
        vec3 col = mix(vec3(1.0, 0.9, 0.65), vec3(1.0, 0.7, 0.3), rim);
        gl_FragColor = vec4(col, glow * 0.5);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // Central point light — moderate to not wash out inner disk
  const light = new THREE.PointLight(0xffeedd, 1.5, 80);
  scene.add(light);
}

function buildDisk() {
  const geo = new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 64);

  // Build gap uniform arrays
  const gapPosArr = GAPS.map(g => g.pos);
  const gapWidthArr = GAPS.map(g => g.width);
  const gapDepthArr = GAPS.map(g => g.depth);

  diskUniforms = {
    innerR:   { value: DISK_INNER },
    outerR:   { value: DISK_OUTER },
    time:     { value: 0 },
    gapPos:   { value: gapPosArr },
    gapWidth: { value: gapWidthArr },
    gapDepth: { value: gapDepthArr },
  };

  const diskMat = new THREE.ShaderMaterial({
    vertexShader: DiskShader.vertexShader,
    fragmentShader: DiskShader.fragmentShader,
    uniforms: diskUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // Main disk in XZ plane
  const disk = new THREE.Mesh(geo, diskMat);
  disk.rotation.x = -Math.PI / 2;
  scene.add(disk);

  // Slight volume — thin offset copy for disk thickness
  const diskBelow = new THREE.Mesh(geo, diskMat);
  diskBelow.rotation.x = -Math.PI / 2;
  diskBelow.position.y = -0.15;
  scene.add(diskBelow);
}

function buildScatterHaze() {
  // Faint warm haze layer above/below disk — scattered starlight from dust
  const hazeGeo = new THREE.RingGeometry(0.8, 42, 128, 16);
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
        float t = clamp((vRadius - 0.8) / 41.2, 0.0, 1.0);
        float brightness = pow(max(1.0 - t * 0.9, 0.01), 1.5);
        vec3 col = vec3(1.0, 0.8, 0.5) * brightness * 0.15;
        float alpha = brightness * 0.08 * smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.7, t);
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
  hazeAbove.position.y = 0.8;
  scene.add(hazeAbove);

  const hazeBelow = new THREE.Mesh(hazeGeo, hazeMat);
  hazeBelow.rotation.x = -Math.PI / 2;
  hazeBelow.position.y = -0.8;
  scene.add(hazeBelow);
}

function buildProtoplanets() {
  const planetDefs = [
    { name: 'HL Tau b', gapIdx: 1, radius: 0.35, color: 0xc87830, emissive: 0x5a3010 },
    { name: 'HL Tau c', gapIdx: 2, radius: 0.25, color: 0x887766, emissive: 0x332211 },
    { name: 'HL Tau d', gapIdx: 4, radius: 0.30, color: 0x8899bb, emissive: 0x223344 },
  ];

  planetDefs.forEach((def) => {
    const gap = GAPS[def.gapIdx];
    const orbitR = DISK_INNER + gap.pos * (DISK_OUTER - DISK_INNER);
    const angle = Math.random() * Math.PI * 2;

    // Planet sphere
    const geo = new THREE.SphereGeometry(def.radius, 24, 16);
    const mat = new THREE.MeshPhongMaterial({
      color: def.color,
      emissive: def.emissive,
      emissiveIntensity: 0.4,
      shininess: 30,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      Math.cos(angle) * orbitR,
      0,
      Math.sin(angle) * orbitR,
    );
    scene.add(mesh);
    meshNameMap.set(mesh, def.name);
    clickableObjects.push(mesh);

    // Small glow around protoplanet
    const glowGeo = new THREE.SphereGeometry(def.radius * 2.5, 16, 12);
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
          float g = pow(rim, 3.0) * 0.8;
          gl_FragColor = vec4(1.0, 0.7, 0.3, g * 0.15);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glow);

    // Orbit ring indicator (faint)
    const ringGeo = new THREE.RingGeometry(orbitR - 0.05, orbitR + 0.05, 128, 1);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x666655,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    // Keplerian speed: ω ∝ r^(-3/2)
    const speed = 0.3 / Math.pow(orbitR, 1.5);

    protoplanets.push({ mesh, angle, radius: orbitR, speed, name: def.name });
  });
}

function buildJets() {
  // Bipolar jets along Y axis using CylinderGeometry (tapered)
  const jetLength = 50;
  const jetGeo = new THREE.ConeGeometry(
    jetLength * Math.tan(8 * Math.PI / 180), // base radius at tip
    jetLength,
    32, 48, true,
  );

  jetUniforms = { time: { value: 0 } };

  // Upper jet (+Y)
  const upperMat = new THREE.ShaderMaterial({
    vertexShader: JetShader.vertexShader,
    fragmentShader: JetShader.fragmentShader,
    uniforms: { ...jetUniforms, jetSign: { value: 1.0 } },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // ConeGeometry: tip at +Y/2, base at -Y/2
  // Upper jet: flip so tip is near star (y=0), base extends upward
  const upperJet = new THREE.Mesh(jetGeo, upperMat);
  upperJet.rotation.x = Math.PI; // tip at bottom (near star)
  upperJet.position.y = jetLength / 2;
  scene.add(upperJet);

  // Lower jet (-Y)
  const lowerMat = new THREE.ShaderMaterial({
    vertexShader: JetShader.vertexShader,
    fragmentShader: JetShader.fragmentShader,
    uniforms: { ...jetUniforms, jetSign: { value: -1.0 } },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // Lower jet: default orientation, tip points up (toward star), base extends down
  const lowerJet = new THREE.Mesh(jetGeo, lowerMat);
  lowerJet.position.y = -jetLength / 2;
  scene.add(lowerJet);
}

function buildDustEnvelope() {
  // Faint infalling envelope around the whole system
  const envGeo = new THREE.SphereGeometry(55, 48, 48);
  const envMat = new THREE.ShaderMaterial({
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
        float glow = pow(rim, 4.0);
        vec3 col = vec3(0.6, 0.45, 0.25);
        gl_FragColor = vec4(col, glow * 0.08);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Mesh(envGeo, envMat));
}

function buildParticles() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  particleData = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Distribute more particles near gap edges
    const t = Math.random();
    const r = DISK_INNER + t * (DISK_OUTER - DISK_INNER);
    const angle = Math.random() * Math.PI * 2;

    positions[i * 3]     = Math.cos(angle) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    // Keplerian speed
    const speed = 0.3 / Math.pow(r, 1.5);
    particleData.push({ r, angle, speed, yOff: positions[i * 3 + 1] });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Soft radial gradient sprite texture
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = 32;
  const sctx = spriteCanvas.getContext('2d');
  const gradient = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,200,120,1)');
  gradient.addColorStop(0.4, 'rgba(255,160,80,0.5)');
  gradient.addColorStop(1, 'rgba(200,100,40,0)');
  sctx.fillStyle = gradient;
  sctx.fillRect(0, 0, 32, 32);
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);

  const mat = new THREE.PointsMaterial({
    map: spriteTex,
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}

// ═══════════════════════════════════════════
// View API
// ═══════════════════════════════════════════

export function animate() {
  const dt = 0.016 * sim.timeScale;

  // Update disk rotation
  if (diskUniforms) diskUniforms.time.value += dt * 0.8;

  // Update jets
  if (jetUniforms) jetUniforms.time.value += dt;

  // Orbit protoplanets
  protoplanets.forEach((p) => {
    p.angle += p.speed * dt;
    p.mesh.position.set(
      Math.cos(p.angle) * p.radius,
      0,
      Math.sin(p.angle) * p.radius,
    );
  });

  // Orbit dust particles
  if (particleSystem) {
    const posAttr = particleSystem.geometry.getAttribute('position');
    const arr = posAttr.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const pd = particleData[i];
      pd.angle += pd.speed * dt;
      arr[i * 3]     = Math.cos(pd.angle) * pd.r;
      arr[i * 3 + 1] = pd.yOff;
      arr[i * 3 + 2] = Math.sin(pd.angle) * pd.r;
    }
    posAttr.needsUpdate = true;
  }

  // Focus transition
  if (focusTransition) {
    const elapsed = performance.now() - focusTransition.startTime;
    const t = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
  protoplanets = [];
  particleData = [];
  scene.clear();
}

export function focusOn(mesh) {
  const name = meshNameMap.get(mesh);
  const target = mesh.getWorldPosition(new THREE.Vector3());
  const dist = name === 'HL Tauri' ? 8 : 5;
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
    { name: 'HL Tauri', mesh: starMesh },
    ...protoplanets.map(p => ({ name: p.name, mesh: p.mesh })),
  ];
}
