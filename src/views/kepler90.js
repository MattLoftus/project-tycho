import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// Kepler-90 — G0V Sun-like star, 2,840 ly away
// 8 confirmed planets (most of any known system besides our own)
// Kepler-90i discovered by Google AI / machine learning (2017)
// Near 3:4 resonance chain among inner worlds
// ═══════════════════════════════════════════════════════════════

const PLANET_DATA = [
  // b — inner super-Earth (1.31 R⊕, 7.008 d)
  { name: 'Kepler-90b', texture: '/textures/mercury.jpg', radius: 0.18, orbit: 3.5,  speed: 0.005000, zone: 'hot' },
  // c — super-Earth (1.18 R⊕, 8.719 d)
  { name: 'Kepler-90c', texture: '/textures/mercury.jpg', radius: 0.16, orbit: 4.8,  speed: 0.004020, zone: 'hot' },
  // i — super-Earth discovered by AI (1.32 R⊕, 14.45 d)
  { name: 'Kepler-90i', texture: '/textures/mars.jpg',    radius: 0.18, orbit: 6.5,  speed: 0.002424, zone: 'hot' },
  // d — sub-Neptune (2.88 R⊕, 59.74 d)
  { name: 'Kepler-90d', texture: '/textures/neptune.jpg', radius: 0.35, orbit: 12.0, speed: 0.000587, zone: 'warm' },
  // e — sub-Neptune (2.67 R⊕, 91.94 d)
  { name: 'Kepler-90e', texture: '/textures/uranus.jpg',  radius: 0.33, orbit: 17.0, speed: 0.000381, zone: 'warm' },
  // f — sub-Neptune (2.89 R⊕, 124.91 d)
  { name: 'Kepler-90f', texture: '/textures/neptune.jpg', radius: 0.35, orbit: 22.0, speed: 0.000281, zone: 'warm' },
  // g — gas giant (8.13 R⊕, 210.60 d)
  { name: 'Kepler-90g', texture: '/textures/jupiter.jpg', radius: 0.65, orbit: 35.0, speed: 0.000166, zone: 'cold' },
  // h — Jupiter-sized (11.32 R⊕, 331.60 d, ~1.2 AU)
  { name: 'Kepler-90h', texture: '/textures/saturn.jpg',  radius: 0.80, orbit: 52.0, speed: 0.000106, zone: 'cold' },
];

let scene, camera, controls, renderer, camMove;
let star;
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

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 25, 70);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 600;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Kepler-90 — G0V, slightly hotter/brighter than our Sun ──
  const starGeo = new THREE.SphereGeometry(2.0, 64, 64);
  const starMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/sun.jpg'),
    color: new THREE.Color(1.0, 0.92, 0.65),
  });
  star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // Corona — bright yellow-white glow
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
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float glow = pow(rim, 3.5) * 1.8;
        vec3 inner = vec3(1.0, 0.95, 0.7);
        vec3 outer = vec3(1.0, 0.7, 0.2);
        gl_FragColor = vec4(mix(inner, outer, rim), glow * 0.85);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // Warm white-yellow light — slightly brighter than our Sun (1.2 L☉)
  const starLight = new THREE.PointLight(0xfff0d0, 2.8, 0, 0);
  scene.add(starLight);
  scene.add(new THREE.AmbientLight(0x100e08, 0.15));

  // ── Planets ──
  clickableObjects = [star];
  planets = [];

  PLANET_DATA.forEach((data) => {
    const geo = new THREE.SphereGeometry(data.radius, 32, 32);
    const mat = new THREE.MeshPhongMaterial({
      map: loader.load(data.texture),
      shininess: 10,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    clickableObjects.push(mesh);

    // Orbit lines
    const orbitColor = data.zone === 'hot' ? 0xff8844
                     : data.zone === 'warm' ? 0xddcc66
                     : 0xaaccdd;
    const orbitOpacity = 0.40;
    const curve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(
      curve.getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y))
    );
    scene.add(new THREE.Line(orbitGeo,
      new THREE.LineBasicMaterial({ color: orbitColor, transparent: true, opacity: orbitOpacity })
    ));

    planets.push({ mesh, angle: Math.random() * Math.PI * 2, ...data });
  });

  // ── Starfield ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(star, 'Kepler-90');
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

  // Post-processing — bright warm tone
  const post = createComposer(renderer, scene, camera);
  composer = post.composer;
  cinematicPass = post.cinematicPass;
  post.bloomPass.strength = 1.0;
  post.bloomPass.threshold = 0.6;
}

export function animate() {
  const ts = sim.timeScale;

  star.rotation.y += 0.00005 * ts;

  planets.forEach((planet) => {
    planet.angle += planet.speed * 0.25 * ts;
    planet.mesh.position.set(
      planet.orbit * Math.cos(planet.angle),
      0,
      planet.orbit * Math.sin(planet.angle)
    );
    planet.mesh.rotation.y += 0.001 * ts;
  });

  if (focusTransition) {
    if (lockedMesh && lastLockedPos) {
      const newPos = lockedMesh.getWorldPosition(new THREE.Vector3());
      const delta = newPos.clone().sub(lastLockedPos);
      focusTransition.endCam.add(delta);
      focusTransition.endTarget.add(delta);
      lastLockedPos = newPos.clone();
    }
    const elapsed = performance.now() - focusTransition.startTime;
    const t = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startTarget, focusTransition.endTarget, ease);
    camera.position.lerpVectors(focusTransition.startCam, focusTransition.endCam, ease);
    if (t >= 1) focusTransition = null;
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
  lockedMesh = null; lastLockedPos = null; focusTransition = null;
  camMove.dispose();
  scene.clear();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  let endCam;
  if (mesh === star) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCam = clickedPos.clone().add(dir.multiplyScalar(10));
  } else {
    const pd = planets.find((p) => p.mesh === mesh);
    const dist = Math.max(3.0, pd ? pd.radius * 10 : 3.0);
    const toStarDir = clickedPos.clone().normalize().negate();
    endCam = clickedPos.clone().add(toStarDir.multiplyScalar(dist));
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  const pd = planets.find((p) => p.mesh === mesh);
  controls.minDistance = (mesh === star ? 2.0 : (pd ? pd.radius : 0.3)) * 1.5;
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
    { name: 'Kepler-90', mesh: star },
    ...planets.map((p) => ({ name: p.name, mesh: p.mesh })),
  ];
}
