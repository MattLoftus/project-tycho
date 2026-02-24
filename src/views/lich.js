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
  const pulsarGeo = new THREE.SphereGeometry(0.15, 32, 32);
  const pulsarMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.85, 0.92, 1.0),
  });
  pulsar = new THREE.Mesh(pulsarGeo, pulsarMat);
  scene.add(pulsar);

  // Core glow — tight bright halo
  const coreGlowGeo = new THREE.SphereGeometry(0.4, 32, 32);
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
        float glow = pow(rim, 2.0) * 2.5;
        vec3 inner = vec3(0.8, 0.9, 1.0);
        vec3 outer = vec3(0.3, 0.5, 1.0);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, glow * 0.7);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(coreGlowGeo, coreGlowMat));

  // ── Radiation beams — two opposing cones ──
  beamGroup = new THREE.Group();
  // Tilt beam axis ~45° from orbital plane
  beamGroup.rotation.x = Math.PI * 0.25;

  const beamLength = 14;
  const beamRadius = 1.2;

  function createBeam(direction) {
    const beamGeo = new THREE.ConeGeometry(beamRadius, beamLength, 24, 1, true);
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying float vY;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vY = position.y;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vY;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float dist = abs(vY) / ${beamLength.toFixed(1)};
          float falloff = pow(1.0 - dist, 2.5);
          float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
          float edge = pow(rim, 1.5);
          vec3 coreColor = vec3(0.6, 0.75, 1.0);
          vec3 edgeColor = vec3(0.25, 0.35, 0.85);
          vec3 color = mix(coreColor, edgeColor, edge);
          float alpha = falloff * (0.3 + edge * 0.4) * 0.6;
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
  scene.add(beamGroup);

  // ── Equatorial torus glow (magnetosphere) ──
  const torusGeo = new THREE.TorusGeometry(0.6, 0.12, 16, 48);
  const torusMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.3, 0.45, 0.9),
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const torus = new THREE.Mesh(torusGeo, torusMat);
  torus.rotation.x = Math.PI / 2;
  scene.add(torus);

  // ── Pulsing light ──
  pulsarLight = new THREE.PointLight(0x8888ff, 2.0, 0, 0);
  scene.add(pulsarLight);
  const ambientLight = new THREE.AmbientLight(0x080810, 0.3);
  scene.add(ambientLight);

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
  post.bloomPass.strength = 1.8;
  post.bloomPass.threshold = 0.35;
  // Cold blue color grading
  cinematicPass.uniforms.liftB.value = 1.10;
  cinematicPass.uniforms.liftR.value = 0.90;
  cinematicPass.uniforms.vignetteIntensity.value = 0.50;
}

export function animate() {
  const ts = sim.timeScale;
  const t = clock.getElapsedTime();

  // Beam rotation — visual rate ~2.5 Hz (real: 161 Hz, slowed for display)
  beamGroup.rotation.y += 15.7 * 0.016 * ts;

  // Pulsing light — modulates with beam sweep
  pulsarLight.intensity = 1.5 + 1.0 * Math.abs(Math.sin(t * 15.0 * ts));

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
