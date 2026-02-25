import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// PSR B1257+12 (Lich) — first confirmed exoplanet system (1992)
// Millisecond pulsar with three planets: Draugr, Poltergeist, Phobetor
// ═══════════════════════════════════════════════════════════════

const PLANET_DATA = [
  { name: 'Draugr',     texture: '/textures/moon.jpg',    radius: 0.08, orbit: 3.5, speed: 0.00380, zone: 'irradiated' },
  { name: 'Poltergeist', texture: '/textures/mercury.jpg', radius: 0.28, orbit: 7.0, speed: 0.00145, zone: 'irradiated' },
  { name: 'Phobetor',   texture: '/textures/mercury.jpg',  radius: 0.27, orbit: 9.5, speed: 0.00098, zone: 'irradiated' },
];

let scene, camera, controls, renderer, camMove;
let pulsar, pulsarLight, beamGroup;
let pulseFlashMat, bloomPass;
let torusUniforms;
let particleSystem, particlePositions, particleVelocities, particleSpeeds;
let planets = [];
let raycaster, mouse, clickableObjects;
let focusTransition;
let lockedMesh = null;
let lastLockedPos = null;
let composer, cinematicPass;
const TRANSITION_DURATION = 2000;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
let clock;
let beamAngle = 0;

const BEAM_TILT = Math.PI * 0.25; // ~45° magnetic axis tilt
const PARTICLE_COUNT = 400;

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(0, 10, 28);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Pulsar — tiny, intensely bright neutron star ──
  const pulsarGeo = new THREE.SphereGeometry(0.2, 32, 32);
  const pulsarMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.9, 0.95, 1.0),
  });
  pulsar = new THREE.Mesh(pulsarGeo, pulsarMat);
  scene.add(pulsar);

  // Core glow — tight bright halo
  const coreGlowGeo = new THREE.SphereGeometry(0.5, 32, 32);
  const coreGlowMat = new THREE.ShaderMaterial({
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
  scene.add(new THREE.Mesh(coreGlowGeo, coreGlowMat));

  // Hotspot caps — bright emission at magnetic poles
  const hotspotGeo = new THREE.SphereGeometry(0.22, 32, 32);
  const hotspotMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vLocalPos;
      void main() {
        float pole = abs(vLocalPos.y) / 0.22;
        float cap = smoothstep(0.6, 1.0, pole);
        vec3 color = vec3(0.7, 0.85, 1.0);
        gl_FragColor = vec4(color, cap * 0.8);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const hotspots = new THREE.Mesh(hotspotGeo, hotspotMat);

  // Pulse flash — camera-facing burst when beam sweeps toward viewer
  const pulseFlashGeo = new THREE.SphereGeometry(1.2, 16, 16);
  pulseFlashMat = new THREE.MeshBasicMaterial({
    color: 0xaabbff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(pulseFlashGeo, pulseFlashMat));

  // ── Radiation beams — two opposing cones with spiral structure ──
  beamGroup = new THREE.Group();
  beamGroup.rotation.x = BEAM_TILT;
  beamAngle = 0;

  const beamLength = 14;
  const beamRadius = 1.2;

  function createBeam(direction) {
    const beamGeo = new THREE.ConeGeometry(beamRadius, beamLength, 32, 1, true);
    const beamMat = new THREE.ShaderMaterial({
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
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = direction * beamLength * 0.5;
    return beam;
  }

  beamGroup.add(createBeam(1));   // top beam
  beamGroup.add(createBeam(-1));  // bottom beam
  beamGroup.add(hotspots);
  scene.add(beamGroup);

  // ── Streaming particles along beams ──
  const particleGeo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocities = new Float32Array(PARTICLE_COUNT);
  particleSpeeds = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
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
    size: 0.1,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  particleSystem = new THREE.Points(particleGeo, particleMat);
  beamGroup.add(particleSystem);

  // ── Magnetic field lines (dipole) ──
  const fieldLineMat = new THREE.MeshBasicMaterial({
    color: 0x7788dd,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const R_MAX = 2.8; // scaled for exoplanet system (inner to Draugr orbit)
  const TUBE_RADIUS = 0.025;
  for (let i = 0; i < 8; i++) {
    const phi = (i / 8) * Math.PI * 2;
    const points = [];
    for (let theta = 0.1; theta < Math.PI - 0.1; theta += 0.05) {
      const r = R_MAX * Math.sin(theta) * Math.sin(theta);
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.cos(theta);
      const z = r * Math.sin(theta) * Math.sin(phi);
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 48, TUBE_RADIUS, 5, false);
    beamGroup.add(new THREE.Mesh(tubeGeo, fieldLineMat));
  }

  // ── Equatorial wind torus — animated ──
  const torusGeo = new THREE.TorusGeometry(1.8, 0.4, 20, 48);
  torusUniforms = { time: { value: 0 } };
  const torusMat = new THREE.ShaderMaterial({
    uniforms: torusUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 1.8);
        float swirl = sin(vUv.x * 25.0 + time * 3.0) * 0.5 + 0.5;
        float pulse = 0.85 + 0.15 * sin(time * 5.0);
        vec3 color = mix(vec3(0.2, 0.35, 0.8), vec3(0.5, 0.3, 0.7), swirl);
        float alpha = glow * 0.2 * (0.5 + swirl * 0.5) * pulse;
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

  // ── Pulsing light ──
  pulsarLight = new THREE.PointLight(0x8899ff, 2.0, 0, 0);
  scene.add(pulsarLight);
  scene.add(new THREE.AmbientLight(0x080810, 0.3));

  // ── Planets ──
  clickableObjects = [pulsar];
  planets = [];

  PLANET_DATA.forEach((data) => {
    const geo = new THREE.SphereGeometry(data.radius, 32, 32);
    const mat = new THREE.MeshPhongMaterial({
      map: loader.load(data.texture),
      shininess: 4,
      color: new THREE.Color(0.7, 0.72, 0.8), // Slight blue-gray tint — irradiated
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    clickableObjects.push(mesh);

    // Orbit line — muted blue-gray
    const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(
      orbitCurve.getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y))
    );
    scene.add(new THREE.Line(orbitGeo,
      new THREE.LineBasicMaterial({ color: 0x667788, transparent: true, opacity: 0.3 })
    ));

    planets.push({ mesh, angle: Math.random() * Math.PI * 2, ...data });
  });

  // ── Starfield ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(pulsar, 'PSR B1257+12');
  planets.forEach((p) => meshNameMap.set(p.mesh, p.name));

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

  // ── Post-processing — high bloom for intense pulsar ──
  const post = createComposer(renderer, scene, camera);
  composer = post.composer;
  cinematicPass = post.cinematicPass;
  bloomPass = post.bloomPass;
  bloomPass.strength = 1.8;
  bloomPass.threshold = 0.35;
  // Cold blue color grading
  cinematicPass.uniforms.liftB.value = 1.10;
  cinematicPass.uniforms.liftR.value = 0.90;
  cinematicPass.uniforms.vignetteIntensity.value = 0.50;
}

export function animate() {
  const ts = sim.timeScale;
  const t = clock.getElapsedTime();
  const dt = 0.016;

  // Beam rotation — visual rate ~2.5 Hz (real: 161 Hz, slowed for display)
  beamAngle += 15.7 * dt * ts;
  beamGroup.rotation.y = beamAngle;

  // Pulsing light tied to beam sweep
  pulsarLight.intensity = 2.0 + 1.5 * Math.abs(Math.sin(beamAngle));

  // ── Camera-facing pulse flash ──
  const beamDir = new THREE.Vector3(0, 1, 0);
  beamDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), BEAM_TILT);
  beamDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), beamAngle);
  const camDir = camera.position.clone().normalize();
  const dot1 = beamDir.dot(camDir);
  const dot2 = -beamDir.dot(camDir);
  const maxDot = Math.max(dot1, dot2);
  const flashIntensity = Math.pow(Math.max(0, maxDot - 0.7) / 0.3, 2.0);
  pulseFlashMat.opacity = flashIntensity * 0.3;
  bloomPass.strength = 1.8 + flashIntensity * 0.6;

  // Update beam shader time uniforms (spiral animation)
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
    if (Math.abs(arr[i * 3 + 1]) > 14) {
      const angle = Math.random() * Math.PI * 2;
      const spread = Math.random() * 0.4;
      arr[i * 3]     = Math.cos(angle) * spread;
      arr[i * 3 + 1] = dir * Math.random() * 2;
      arr[i * 3 + 2] = Math.sin(angle) * spread;
    }
  }
  posAttr.needsUpdate = true;

  // Torus animation
  torusUniforms.time.value = t;

  // Planet orbits
  planets.forEach((planet) => {
    planet.angle += planet.speed * 0.25 * ts;
    planet.mesh.position.set(
      planet.orbit * Math.cos(planet.angle),
      0,
      planet.orbit * Math.sin(planet.angle)
    );
    planet.mesh.rotation.y += 0.001 * ts;
  });

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
  if (mesh === pulsar) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCam = clickedPos.clone().add(dir.multiplyScalar(4));
  } else {
    const toStarDir = clickedPos.clone().normalize().negate();
    endCam = clickedPos.clone().add(toStarDir.multiplyScalar(1.5));
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  const pd = planets.find((p) => p.mesh === mesh);
  controls.minDistance = (mesh === pulsar ? 0.3 : (pd ? pd.radius : 0.15)) * 1.5;
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
    { name: 'PSR B1257+12', mesh: pulsar },
    ...planets.map((p) => ({ name: p.name, mesh: p.mesh })),
  ];
}
