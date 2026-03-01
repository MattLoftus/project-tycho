import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// Cassiopeia A — Supernova Remnant
// Youngest known SNR in the Milky Way (~340 yr), expanding at ~5000 km/s
// Multi-layered shell: forward shock (blue), reverse shock ejecta (red/green),
// synchrotron interior, fast-moving ejecta knots
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let centralStar;
let shellMeshes; // refs for expansion animation
let forwardShockUniforms, reverseShockUniforms, interiorUniforms;
let particleSystem, particlePositions, particleVelocities, particleSpeeds;
let raycaster, mouse, clickableObjects;
let focusTransition;
let lockedMesh = null;
let lastLockedPos = null;
let composer, cinematicPass, bloomPass;
const TRANSITION_DURATION = 2000;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
let clock;
let expansionTime = 0;

const PARTICLE_COUNT = 2000;

// ─── Shared GLSL noise functions ───────────────────────────────────────────

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

// ─── Standard vertex shader for nebula shells ──────────────────────────────

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

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  expansionTime = 0;

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(30, 18, 38);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Central neutron star — tiny, dim ──
  const coreGeo = new THREE.SphereGeometry(0.15, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.8, 0.85, 1.0),
  });
  centralStar = new THREE.Mesh(coreGeo, coreMat);
  scene.add(centralStar);

  // ── Core glow halo ──
  const glowGeo = new THREE.SphereGeometry(0.4, 32, 32);
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 2.0) * 2.0;
        vec3 inner = vec3(0.8, 0.85, 1.0);
        vec3 outer = vec3(0.4, 0.5, 1.0);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, glow * 0.4);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // ── Synchrotron interior — faint purple-blue inner glow ──
  const interiorGeo = new THREE.SphereGeometry(8, 48, 48);
  interiorUniforms = { time: { value: 0 } };
  const interiorMat = new THREE.ShaderMaterial({
    uniforms: interiorUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float dist = length(vPosition) / 8.0;
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        vec3 noisePos = vPosition * 0.12 + vec3(time * 0.01, time * -0.008, time * 0.006);
        float n = fbm(noisePos);
        float filament = smoothstep(0.25, 0.6, n);

        float density = pow(1.0 - dist, 2.0);

        // Synchrotron purple-blue
        vec3 color = mix(vec3(0.5, 0.4, 0.8), vec3(0.3, 0.35, 0.9), dist);

        float alpha = rim * filament * density * 0.35;
        alpha += density * 0.05; // base glow
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const interiorMesh = new THREE.Mesh(interiorGeo, interiorMat);
  scene.add(interiorMesh);

  // ── Reverse shock shell — dense ejecta with warm element-emission colors ──
  const reverseGeo = new THREE.SphereGeometry(15, 64, 64);
  reverseShockUniforms = { time: { value: 0 } };
  const reverseShockMat = new THREE.ShaderMaterial({
    uniforms: reverseShockUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float dist = length(vPosition) / 15.0;
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        // Primary filament structure
        vec3 noisePos = vPosition * 0.1 + vec3(time * 0.012, time * -0.01, time * 0.008);
        float n = fbm(noisePos);
        float filament = smoothstep(0.18, 0.55, n);

        // Secondary tendril detail
        float tendril = fbm(vPosition * 0.2 + vec3(0.0, time * 0.015, 0.0));
        filament = max(filament, smoothstep(0.48, 0.78, tendril) * 0.6);

        // Asymmetric lumpy shell — use noise to modulate shell thickness
        float shellNoise = fbm(normalize(vPosition) * 3.0 + vec3(42.0));
        float shellEdge = smoothstep(0.7, 1.0, dist + (shellNoise - 0.5) * 0.3);
        float shellInner = smoothstep(0.3, 0.5, dist);
        float shellMask = shellInner * (1.0 - shellEdge);

        // Position-dependent element emission colors
        // Use noise seeded by direction to create patches of different elements
        float colorSeed = fbm(normalize(vPosition) * 2.0 + vec3(100.0));

        // Silicon/sulfur = red-orange, oxygen = green, hydrogen = deep red
        vec3 silicon  = vec3(0.9, 0.3, 0.12);   // red-orange
        vec3 oxygen   = vec3(0.15, 0.75, 0.35);  // green
        vec3 hydrogen = vec3(0.85, 0.15, 0.2);   // deep red
        vec3 sulfur   = vec3(1.0, 0.6, 0.08);    // orange-yellow

        vec3 color;
        if (colorSeed < 0.3) {
          color = mix(silicon, sulfur, smoothstep(0.1, 0.3, colorSeed));
        } else if (colorSeed < 0.55) {
          color = mix(sulfur, oxygen, smoothstep(0.3, 0.55, colorSeed));
        } else if (colorSeed < 0.75) {
          color = oxygen;
        } else {
          color = mix(hydrogen, silicon, smoothstep(0.75, 1.0, colorSeed));
        }

        // Brighten near the shell edge
        color += vec3(0.15) * shellEdge * filament;

        float alpha = filament * shellMask * 0.55;
        alpha += shellMask * 0.08; // base shell visibility
        alpha *= (0.4 + rim * 0.6); // rim brightens edges but shell is visible throughout
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const reverseMesh = new THREE.Mesh(reverseGeo, reverseShockMat);
  scene.add(reverseMesh);

  // ── Forward shock shell — outer blast wave, blue-white ──
  const forwardGeo = new THREE.SphereGeometry(25, 64, 64);
  forwardShockUniforms = { time: { value: 0 } };
  const forwardShockMat = new THREE.ShaderMaterial({
    uniforms: forwardShockUniforms,
    vertexShader: SHELL_VERTEX,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      ${NOISE_GLSL}

      void main() {
        float dist = length(vPosition) / 25.0;
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        vec3 noisePos = vPosition * 0.065 + vec3(time * 0.008, time * 0.006, time * -0.007);
        float n = fbm(noisePos);
        float filament = smoothstep(0.2, 0.58, n);

        // Asymmetric shell edge
        float shellNoise = fbm(normalize(vPosition) * 2.5 + vec3(77.0));
        float shellEdge = smoothstep(0.75, 1.0, dist + (shellNoise - 0.5) * 0.25);
        float shellInner = smoothstep(0.6, 0.75, dist);
        float shellMask = shellInner * (1.0 - shellEdge);

        float density = pow(1.0 - dist, 1.5);

        // Blue-white shock-heated gas
        vec3 inner = vec3(0.4, 0.6, 1.0);
        vec3 outer = vec3(0.7, 0.82, 1.0);
        vec3 color = mix(inner, outer, dist);

        // Slight purple tint in some regions
        float purplePatch = fbm(normalize(vPosition) * 4.0 + vec3(200.0));
        color = mix(color, vec3(0.6, 0.4, 0.9), smoothstep(0.55, 0.75, purplePatch) * 0.3);

        float alpha = filament * shellMask * 0.4;
        alpha += shellMask * 0.06; // base shell visibility even without filaments
        alpha *= (0.35 + rim * 0.65); // edges brighter, face still visible
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const forwardMesh = new THREE.Mesh(forwardGeo, forwardShockMat);
  scene.add(forwardMesh);

  // ── Wispy outer halo — very faint extended emission ──
  const haloGeo = new THREE.SphereGeometry(35, 48, 48);
  const haloMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 3.5);
        vec3 color = vec3(0.35, 0.5, 0.9);
        gl_FragColor = vec4(color, glow * 0.15);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  scene.add(haloMesh);

  shellMeshes = [interiorMesh, reverseMesh, forwardMesh, haloMesh];

  // ── Ejecta knots — fast-moving clumps of debris ──
  const particleGeo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocities = new Float32Array(PARTICLE_COUNT * 3); // radial direction
  particleSpeeds = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Random direction (uniform sphere)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.sin(phi) * Math.sin(theta);
    const dz = Math.cos(phi);

    // Position within the ejecta shell region (radius 5-20)
    const r = 5 + Math.random() * 15;
    particlePositions[i * 3]     = dx * r;
    particlePositions[i * 3 + 1] = dy * r;
    particlePositions[i * 3 + 2] = dz * r;

    // Radial velocity direction
    particleVelocities[i * 3]     = dx;
    particleVelocities[i * 3 + 1] = dy;
    particleVelocities[i * 3 + 2] = dz;

    particleSpeeds[i] = 1.5 + Math.random() * 3.5; // units/sec
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

  // Soft circular sprite texture for particles
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = 32;
  const sctx = spriteCanvas.getContext('2d');
  const gradient = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,200,120,1)');
  gradient.addColorStop(0.3, 'rgba(255,160,80,0.6)');
  gradient.addColorStop(1, 'rgba(255,100,40,0)');
  sctx.fillStyle = gradient;
  sctx.fillRect(0, 0, 32, 32);
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);

  const particleMat = new THREE.PointsMaterial({
    map: spriteTex,
    size: 0.6,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particleSystem = new THREE.Points(particleGeo, particleMat);
  scene.add(particleSystem);

  // ── Lighting ──
  const centralLight = new THREE.PointLight(0x6688ff, 1.5, 0, 0);
  scene.add(centralLight);
  scene.add(new THREE.AmbientLight(0x060608, 0.1));

  // Rim lights to highlight shell edges from outside
  const rimLight1 = new THREE.PointLight(0x4466cc, 0.6, 80, 0);
  rimLight1.position.set(40, 20, 10);
  scene.add(rimLight1);

  const rimLight2 = new THREE.PointLight(0xcc6644, 0.4, 80, 0);
  rimLight2.position.set(-30, -15, 25);
  scene.add(rimLight2);

  // ── Starfield ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(centralStar, 'Cassiopeia A');
  clickableObjects = [centralStar];

  // ── Input ──
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  focusTransition = null;

  boundOnClick = (event) => {
    if (event.detail === 0) return;
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) {
      const obj = hits[0].object;
      const target = meshNameMap.has(obj) ? obj : obj.parent;
      if (meshNameMap.has(target)) focusOn(target);
    }
  };

  boundOnMouseMove = (event) => {
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) {
      const obj = hits[0].object;
      const name = meshNameMap.get(obj) ?? meshNameMap.get(obj.parent);
      renderer.domElement.style.cursor = 'pointer';
      if (cbHover && name) cbHover(name, event.clientX, event.clientY);
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
  cinematicPass = post.cinematicPass;
  bloomPass = post.bloomPass;
  bloomPass.strength = 1.4;
  bloomPass.threshold = 0.35;
  // Warm/cool balanced grading
  cinematicPass.uniforms.liftR.value = 0.95;
  cinematicPass.uniforms.liftB.value = 1.05;
  cinematicPass.uniforms.vignetteIntensity.value = 0.55;
}

export function animate() {
  const ts = sim.timeScale;
  const t = clock.getElapsedTime();
  const dt = 0.016;

  expansionTime += dt * ts;

  // Slow shell expansion — barely perceptible, visible with high timeScale
  const expansionScale = 1.0 + expansionTime * 0.0008;
  shellMeshes.forEach(m => m.scale.setScalar(expansionScale));

  // Update shader time uniforms
  forwardShockUniforms.time.value = t;
  reverseShockUniforms.time.value = t;
  interiorUniforms.time.value = t;

  // ── Ejecta knot particles — drift outward ──
  const posAttr = particleSystem.geometry.getAttribute('position');
  const arr = posAttr.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const speed = particleSpeeds[i];
    arr[i * 3]     += particleVelocities[i * 3]     * speed * dt * ts;
    arr[i * 3 + 1] += particleVelocities[i * 3 + 1] * speed * dt * ts;
    arr[i * 3 + 2] += particleVelocities[i * 3 + 2] * speed * dt * ts;

    // Reset if past the outer halo
    const px = arr[i * 3], py = arr[i * 3 + 1], pz = arr[i * 3 + 2];
    const dist = Math.sqrt(px * px + py * py + pz * pz);
    if (dist > 32) {
      // Respawn within ejecta shell
      const r = 5 + Math.random() * 10;
      arr[i * 3]     = particleVelocities[i * 3]     * r;
      arr[i * 3 + 1] = particleVelocities[i * 3 + 1] * r;
      arr[i * 3 + 2] = particleVelocities[i * 3 + 2] * r;
    }
  }
  posAttr.needsUpdate = true;

  // Focus transition
  if (focusTransition) {
    if (lockedMesh && lastLockedPos) {
      const newPos = lockedMesh.getWorldPosition(new THREE.Vector3());
      const delta = newPos.clone().sub(lastLockedPos);
      focusTransition.endCam.add(delta);
      focusTransition.endTarget.add(delta);
      lastLockedPos = newPos.clone();
    }
    const elapsed = performance.now() - focusTransition.startTime;
    const ft = Math.min(elapsed / focusTransition.duration, 1);
    const ease = ft < 0.5 ? 2 * ft * ft : 1 - Math.pow(-2 * ft + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startTarget, focusTransition.endTarget, ease);
    camera.position.lerpVectors(focusTransition.startCam, focusTransition.endCam, ease);
    if (ft >= 1) focusTransition = null;
  } else if (lockedMesh) {
    const newPos = lockedMesh.getWorldPosition(new THREE.Vector3());
    const delta = newPos.clone().sub(lastLockedPos);
    camera.position.add(delta);
    controls.target.add(delta);
    lastLockedPos = newPos.clone();
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
  lockedMesh = null;
  lastLockedPos = null;
  focusTransition = null;
  camMove.dispose();
  scene.clear();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = clickedPos.clone().add(dir.multiplyScalar(4));
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  controls.minDistance = 0.5;
  if (cbFocus) cbFocus(meshNameMap.get(mesh));
  focusTransition = {
    startCam:    camera.position.clone(),
    endCam,
    startTarget: controls.target.clone(),
    endTarget:   clickedPos.clone(),
    startTime:   performance.now(),
    duration:    TRANSITION_DURATION,
  };
}

export function getObjects() {
  return [{ name: 'Cassiopeia A', mesh: centralStar }];
}
