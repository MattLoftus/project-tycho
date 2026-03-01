import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// Crab Pulsar (PSR B0531+21) — phenomenon view
// Rapidly spinning neutron star at the heart of the Crab Nebula
// 30 Hz rotation, misaligned magnetic axis, pulsar wind nebula
// ═══════════════════════════════════════════════════════════════

let scene, camera, controls, renderer, camMove;
let pulsar, pulsarLight, beamGroup;
let nebulaUniforms, innerNebulaUniforms, torusUniforms;
let particleSystem, particlePositions, particleVelocities, particleSpeeds;
let pulseFlashMat;
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
let beamAngle = 0;

const PARTICLE_COUNT = 800;
const BEAM_TILT = Math.PI * 0.28; // ~50° magnetic axis tilt

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(12, 14, 18);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.3;
  controls.maxDistance = 150;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Neutron star core — tiny, intensely bright ──
  const coreGeo = new THREE.SphereGeometry(0.25, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.9, 0.95, 1.0),
  });
  pulsar = new THREE.Mesh(coreGeo, coreMat);
  scene.add(pulsar);

  // Core glow halo
  const glowGeo = new THREE.SphereGeometry(0.55, 32, 32);
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
        float glow = pow(rim, 2.2) * 2.2;
        vec3 inner = vec3(0.85, 0.92, 1.0);
        vec3 outer = vec3(0.3, 0.45, 1.0);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, glow * 0.5);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // Hotspot caps — bright emission at magnetic poles
  const hotspotGeo = new THREE.SphereGeometry(0.28, 32, 32);
  const hotspotMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3 vLocalPos;
      void main() {
        float poleFactor = abs(vLocalPos.y) / 0.28;
        float cap = smoothstep(0.6, 1.0, poleFactor);
        vec3 color = vec3(0.6, 0.75, 1.0);
        gl_FragColor = vec4(color, cap * 0.8);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const hotspots = new THREE.Mesh(hotspotGeo, hotspotMat);

  // ── Camera-facing pulse flash ──
  const flashGeo = new THREE.SphereGeometry(1.5, 16, 16);
  pulseFlashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.6, 0.75, 1.0),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(flashGeo, pulseFlashMat));

  // ── Radiation beams — two opposing cones ──
  beamGroup = new THREE.Group();
  beamGroup.rotation.x = BEAM_TILT;

  const beamLength = 30;
  const beamRadius = 2.0;

  function createBeam(direction) {
    const geo = new THREE.ConeGeometry(beamRadius, beamLength, 32, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying float vY;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        void main() {
          vY = position.y;
          vLocalPos = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
      precision mediump float;
        uniform float time;
        varying float vY;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        void main() {
          float dist = abs(vY) / ${beamLength.toFixed(1)};
          float falloff = pow(1.0 - dist, 3.0);

          float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
          float edge = pow(rim, 1.2);

          // Spiral internal structure
          float angle = atan(vLocalPos.x, vLocalPos.z);
          float spiral = sin(angle * 3.0 + dist * 12.0 - time * 8.0) * 0.5 + 0.5;
          spiral = mix(0.7, 1.0, spiral * (1.0 - dist));

          vec3 coreColor = vec3(0.5, 0.7, 1.0);
          vec3 edgeColor = vec3(0.2, 0.3, 0.9);
          vec3 color = mix(coreColor, edgeColor, edge);

          float alpha = falloff * (0.25 + edge * 0.5) * spiral * 0.7;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.y = direction * beamLength * 0.5;
    return beam;
  }

  beamGroup.add(createBeam(1));
  beamGroup.add(createBeam(-1));
  beamGroup.add(hotspots);
  scene.add(beamGroup);

  // ── Streaming particles along beams ──
  const particleGeo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocities = new Float32Array(PARTICLE_COUNT); // speed along axis
  particleSpeeds = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Random position along beam axis with slight radial spread
    const dir = i < PARTICLE_COUNT / 2 ? 1 : -1;
    const axisPos = Math.random() * beamLength * dir;
    const spread = (1.0 - Math.abs(axisPos) / beamLength) * beamRadius * 0.6;
    const angle = Math.random() * Math.PI * 2;
    particlePositions[i * 3]     = Math.cos(angle) * spread * Math.random();
    particlePositions[i * 3 + 1] = axisPos;
    particlePositions[i * 3 + 2] = Math.sin(angle) * spread * Math.random();
    particleVelocities[i] = dir;
    particleSpeeds[i] = 8 + Math.random() * 16;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

  const particleMat = new THREE.PointsMaterial({
    color: 0x6688ff,
    size: 0.12,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  particleSystem = new THREE.Points(particleGeo, particleMat);
  beamGroup.add(particleSystem);

  // ── Magnetic field lines (dipole) — TubeGeometry for visibility ──
  const fieldLineMat = new THREE.MeshBasicMaterial({
    color: 0x7788dd,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const R_MAX = 10;
  const TUBE_RADIUS = 0.06;
  for (let i = 0; i < 12; i++) {
    const phi = (i / 12) * Math.PI * 2;
    const points = [];
    for (let theta = 0.08; theta < Math.PI - 0.08; theta += 0.04) {
      const r = R_MAX * Math.sin(theta) * Math.sin(theta);
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.cos(theta);
      const z = r * Math.sin(theta) * Math.sin(phi);
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 64, TUBE_RADIUS, 6, false);
    beamGroup.add(new THREE.Mesh(tubeGeo, fieldLineMat));
  }

  // ── Equatorial wind torus — more visible ──
  const torusGeo = new THREE.TorusGeometry(4.0, 1.0, 24, 64);
  torusUniforms = { time: { value: 0 } };
  const torusMat = new THREE.ShaderMaterial({
    uniforms: torusUniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        vUv = uv;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 1.5);
        float swirl = sin(vUv.x * 25.0 + time * 3.0) * 0.5 + 0.5;
        float pulse = 0.85 + 0.15 * sin(time * 5.0);
        vec3 color = mix(vec3(0.2, 0.35, 0.8), vec3(0.5, 0.3, 0.7), swirl);
        float alpha = glow * 0.18 * (0.5 + swirl * 0.5) * pulse;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const windTorus = new THREE.Mesh(torusGeo, torusMat);
  windTorus.rotation.x = Math.PI / 2;
  scene.add(windTorus);

  // ── Pulsar wind nebula — outer shell (Crab Nebula) ──
  const nebulaGeo = new THREE.SphereGeometry(45, 64, 64);
  nebulaUniforms = { time: { value: 0 } };
  const nebulaMat = new THREE.ShaderMaterial({
    uniforms: nebulaUniforms,
    vertexShader: `
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
    `,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

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

      void main() {
        float dist = length(vPosition) / 45.0;
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        vec3 noisePos = vPosition * 0.07 + vec3(time * 0.015, time * 0.008, time * -0.01);
        float n = fbm(noisePos);
        float filament = smoothstep(0.2, 0.6, n);

        float density = pow(1.0 - dist, 1.5);

        vec3 inner = vec3(0.45, 0.6, 1.0);
        vec3 mid = vec3(0.2, 0.55, 0.85);
        vec3 outer = vec3(0.55, 0.12, 0.35);
        vec3 color = dist < 0.4 ? mix(inner, mid, dist / 0.4) : mix(mid, outer, (dist - 0.4) / 0.6);

        float equatorial = 1.0 - abs(vPosition.y) / (length(vPosition) + 0.001);
        equatorial = pow(equatorial, 3.0) * 0.4 + 0.6;

        float alpha = rim * filament * density * equatorial * 0.12;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(nebulaGeo, nebulaMat));

  // ── Inner nebula shell — denser, brighter, more structured ──
  const innerNebulaGeo = new THREE.SphereGeometry(18, 48, 48);
  innerNebulaUniforms = { time: { value: 0 } };
  const innerNebulaMat = new THREE.ShaderMaterial({
    uniforms: innerNebulaUniforms,
    vertexShader: `
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
    `,
    fragmentShader: `
      precision mediump float;
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;

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
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.3;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        float dist = length(vPosition) / 18.0;
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        // Different noise scale for visible layering
        vec3 noisePos = vPosition * 0.15 + vec3(time * 0.02, time * -0.015, time * 0.01);
        float n = fbm(noisePos);
        float filament = smoothstep(0.15, 0.55, n);

        // Stronger filament tendrils
        float tendril = fbm(vPosition * 0.25 + vec3(0.0, time * 0.03, 0.0));
        filament = max(filament, smoothstep(0.5, 0.8, tendril) * 0.7);

        float density = pow(1.0 - dist, 1.2);

        // Warmer colors for the inner nebula
        vec3 inner = vec3(0.5, 0.65, 1.0);
        vec3 outer = vec3(0.7, 0.25, 0.5);
        vec3 color = mix(inner, outer, dist);

        // Equatorial concentration
        float equatorial = 1.0 - abs(vPosition.y) / (length(vPosition) + 0.001);
        equatorial = pow(equatorial, 2.0) * 0.5 + 0.5;

        float alpha = rim * filament * density * equatorial * 0.18;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(innerNebulaGeo, innerNebulaMat));

  // ── Lighting ──
  pulsarLight = new THREE.PointLight(0x8899ff, 2.0, 0, 0);
  scene.add(pulsarLight);
  scene.add(new THREE.AmbientLight(0x060610, 0.15));

  // ── Starfield ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(pulsar, 'Crab Pulsar');
  clickableObjects = [pulsar];

  // ── Input ──
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  focusTransition = null;
  beamAngle = 0;

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
  bloomPass.threshold = 0.45;
  // Cool blue color grading
  cinematicPass.uniforms.liftB.value = 1.15;
  cinematicPass.uniforms.liftR.value = 0.88;
  cinematicPass.uniforms.vignetteIntensity.value = 0.60;
}

export function animate() {
  const ts = sim.timeScale;
  const t = clock.getElapsedTime();
  const dt = 0.016;

  // Beam rotation — ~3 Hz visual rate
  beamAngle += 18.85 * dt * ts;
  beamGroup.rotation.y = beamAngle;

  // Pulsing light tied to beam sweep
  pulsarLight.intensity = 2.0 + 1.5 * Math.abs(Math.sin(beamAngle));

  // ── Camera-facing pulse flash ──
  // Compute beam tip direction in world space
  const beamDir = new THREE.Vector3(0, 1, 0);
  beamDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), BEAM_TILT);
  beamDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), beamAngle);
  const camDir = camera.position.clone().normalize();
  // Check both beam directions
  const dot1 = beamDir.dot(camDir);
  const dot2 = -beamDir.dot(camDir);
  const maxDot = Math.max(dot1, dot2);
  const flashIntensity = Math.pow(Math.max(0, maxDot - 0.7) / 0.3, 2.0);
  pulseFlashMat.opacity = flashIntensity * 0.35;
  // Also briefly spike bloom on pulse
  bloomPass.strength = 1.4 + flashIntensity * 0.8;

  // Update beam shader time uniforms
  beamGroup.children.forEach((child) => {
    if (child.material?.uniforms?.time) {
      child.material.uniforms.time.value = t;
    }
  });

  // ── Streaming particles ──
  const posAttr = particleSystem.geometry.getAttribute('position');
  const arr = posAttr.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const dir = particleVelocities[i];
    const speed = particleSpeeds[i];
    arr[i * 3 + 1] += dir * speed * dt * ts;
    // Reset if past beam tip
    if (Math.abs(arr[i * 3 + 1]) > 30) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 0.4;
      arr[i * 3]     = Math.cos(angle) * spread;
      arr[i * 3 + 1] = dir * Math.random() * 2;
      arr[i * 3 + 2] = Math.sin(angle) * spread;
    }
  }
  posAttr.needsUpdate = true;

  // Nebula + torus animation
  nebulaUniforms.time.value = t;
  innerNebulaUniforms.time.value = t;
  torusUniforms.time.value = t;

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
  controls.minDistance = 0.3;
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
  return [{ name: 'Crab Pulsar', mesh: pulsar }];
}
