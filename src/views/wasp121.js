import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// WASP-121 — ultra-hot Jupiter with atmospheric escape
// Tidally distorted planet, dayside 2,500 K+, metals escaping
// in a comet-like tail. F6V host star.
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let star, planet, planetAngle;
let tailGeo, tailPositionAttr, tailColorAttr, tailAlphaAttr, tailParticles;
const N_TAIL = 2000;
let raycaster, mouse, clickableObjects;
let focusTransition;
let lockedMesh = null;
let lastLockedPos = null;
let composer, cinematicPass;
const TRANSITION_DURATION = 2000;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;

const ORBIT_RADIUS = 3.5;
const PLANET_SPEED = 0.012; // Fast — 1.27-day period

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(0, 8, 18);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Star — F6V warm white ──
  const starGeo = new THREE.SphereGeometry(2.0, 64, 64);
  const starMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/sun.jpg'),
    color: new THREE.Color(0.95, 0.95, 1.0),
  });
  star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // Corona — white to slight blue
  const glowGeo = new THREE.SphereGeometry(2.0, 64, 64);
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
        float glow = pow(rim, 3.0) * 2.0;
        vec3 inner = vec3(1.0, 0.98, 0.90);
        vec3 outer = vec3(0.75, 0.80, 1.0);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, glow * 0.75);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // Bright warm-white light
  const starLight = new THREE.PointLight(0xfff5e8, 3.0, 0, 0);
  scene.add(starLight);
  scene.add(new THREE.AmbientLight(0x101018, 0.15));

  // ── Planet — tidally distorted, custom shader ──
  const planetGeo = new THREE.SphereGeometry(0.85, 48, 48);
  const jupiterTex = loader.load('/textures/jupiter.jpg');
  const planetMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: jupiterTex },
      uStarDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
      uniform vec3 uStarDir;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vStretch;
      void main() {
        vUv = uv;
        // Roche tidal distortion — stretch toward/away from star
        vec3 localStarDir = normalize((inverse(modelMatrix) * vec4(uStarDir, 0.0)).xyz);
        float alignment = dot(normalize(position), localStarDir);
        float stretch = 1.0 + 0.22 * abs(alignment);
        vec3 pos = position;
        pos += localStarDir * alignment * 0.18 * length(position);
        vStretch = stretch;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D uTex;
      uniform vec3 uStarDir;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vStretch;
      void main() {
        vec3 baseColor = texture2D(uTex, vUv).rgb;
        // Dayside / nightside dichotomy
        float facing = dot(normalize(vWorldNormal), normalize(uStarDir - vWorldPos));
        float dayside = smoothstep(-0.1, 0.5, facing);
        // Dayside: scorching orange-white
        vec3 hotColor = vec3(1.0, 0.65, 0.25) * 1.4;
        // Nightside: dark reddish-brown
        vec3 coldColor = baseColor * vec3(0.25, 0.08, 0.04);
        vec3 color = mix(coldColor, hotColor, dayside);
        // Emissive glow on dayside
        float emissive = dayside * 0.6;
        color += vec3(0.8, 0.4, 0.1) * emissive;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  planet = new THREE.Mesh(planetGeo, planetMat);
  planetAngle = 0;
  scene.add(planet);

  // Atmospheric halo — hot orange, thicker on star-facing side
  const haloGeo = new THREE.SphereGeometry(1.05, 48, 48);
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uStarDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform vec3 uStarDir;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float atmosphere = pow(rim, 2.2) * 2.0;
        // Thicker on star-facing side
        float starFace = max(dot(vWorldNormal, normalize(uStarDir)), 0.0);
        atmosphere *= (0.5 + 0.8 * starFace);
        vec3 color = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.8, 0.3), rim);
        gl_FragColor = vec4(color, atmosphere * 0.45);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  planet.add(halo);

  // ── Orbit line ──
  clickableObjects = [star, planet];
  const orbitCurve = new THREE.EllipseCurve(0, 0, ORBIT_RADIUS, ORBIT_RADIUS, 0, Math.PI * 2);
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(
    orbitCurve.getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y))
  );
  scene.add(new THREE.Line(orbitGeo,
    new THREE.LineBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.55 })
  ));

  // ── Atmospheric escape tail (particle system) ──
  buildTailParticles();

  // ── Starfield ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(star, 'WASP-121');
  meshNameMap.set(planet, 'WASP-121b');

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
  post.bloomPass.strength = 1.2;
  post.bloomPass.threshold = 0.5;
}

function buildTailParticles() {
  tailGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(N_TAIL * 3);
  const colors = new Float32Array(N_TAIL * 3);
  const alphas = new Float32Array(N_TAIL);

  tailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  tailGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  tailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  tailPositionAttr = tailGeo.getAttribute('position');
  tailColorAttr = tailGeo.getAttribute('aColor');
  tailAlphaAttr = tailGeo.getAttribute('aAlpha');

  // Initialize particles with random progress along the tail
  for (let i = 0; i < N_TAIL; i++) {
    tailPositionAttr.setXYZ(i, 0, 0, 0);
    tailColorAttr.setXYZ(i, 1.0, 0.5, 0.1);
    tailAlphaAttr.setX(i, 0);
  }

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
        gl_PointSize = max(1.5, 25.0 / -mv.z);
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

  tailParticles = new THREE.Points(tailGeo, mat);
  scene.add(tailParticles);
}

function updateTail(planetPos, starPos) {
  const antiStar = planetPos.clone().sub(starPos).normalize();
  const pos = tailPositionAttr.array;
  const col = tailColorAttr.array;
  const alp = tailAlphaAttr.array;

  for (let i = 0; i < N_TAIL; i++) {
    // Each particle has a unique distance along the tail
    const seed = i * 2654435761 >>> 0; // hash for deterministic randomness
    const progress = ((seed % 1000) / 1000); // 0-1 along tail
    const tailLength = 12.0;
    const dist = progress * tailLength;

    // Spread increases with distance
    const spread = dist * 0.15;
    const offX = (((seed * 7) % 1000) / 500 - 1) * spread;
    const offY = (((seed * 13) % 1000) / 500 - 1) * spread;
    const offZ = (((seed * 19) % 1000) / 500 - 1) * spread;

    // Perpendicular scatter directions
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(antiStar, up).normalize();
    const actualUp = new THREE.Vector3().crossVectors(right, antiStar).normalize();

    const base = planetPos.clone().add(antiStar.clone().multiplyScalar(dist + 0.9));
    base.add(right.clone().multiplyScalar(offX));
    base.add(actualUp.clone().multiplyScalar(offY));
    base.add(antiStar.clone().multiplyScalar(offZ));

    pos[i * 3]     = base.x;
    pos[i * 3 + 1] = base.y;
    pos[i * 3 + 2] = base.z;

    // Color: hot orange near planet → fading reddish
    const fade = 1.0 - progress;
    col[i * 3]     = 1.0;
    col[i * 3 + 1] = 0.35 + 0.3 * fade;
    col[i * 3 + 2] = 0.05 + 0.15 * fade;

    // Alpha: fade with distance
    alp[i] = fade * fade * 0.3;
  }

  tailPositionAttr.needsUpdate = true;
  tailColorAttr.needsUpdate = true;
  tailAlphaAttr.needsUpdate = true;
}

export function animate() {
  const ts = sim.timeScale;

  star.rotation.y += 0.0002 * ts;

  // Planet orbit — very fast
  planetAngle += PLANET_SPEED * 0.25 * ts;
  const px = ORBIT_RADIUS * Math.cos(planetAngle);
  const pz = ORBIT_RADIUS * Math.sin(planetAngle);
  planet.position.set(px, 0, pz);
  planet.rotation.y += 0.001 * ts;

  // Update shader uniforms — star direction from planet
  const starDir = star.position.clone().sub(planet.position).normalize();
  planet.material.uniforms.uStarDir.value.copy(star.position);

  // Update atmospheric escape tail
  updateTail(planet.position, star.position);

  // Update halo star direction
  const haloMesh = planet.children[0];
  if (haloMesh?.material?.uniforms?.uStarDir) {
    haloMesh.material.uniforms.uStarDir.value.copy(star.position);
  }

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
    const ease = ft < 0.5 ? 2*ft*ft : 1 - Math.pow(-2*ft + 2, 2) / 2;
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
  lockedMesh = null;
  lastLockedPos = null;
  focusTransition = null;
  camMove.dispose();
  scene.clear();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  let endCam;
  if (mesh === star) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCam = clickedPos.clone().add(dir.multiplyScalar(8));
  } else {
    // Position camera on the tail side for dramatic view
    const antiStar = clickedPos.clone().sub(star.position).normalize();
    endCam = clickedPos.clone().add(antiStar.multiplyScalar(4));
    endCam.y += 1.5;
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  controls.minDistance = (mesh === star ? 2.0 : 0.85) * 1.5;
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
  return [
    { name: 'WASP-121', mesh: star },
    { name: 'WASP-121b', mesh: planet },
  ];
}
