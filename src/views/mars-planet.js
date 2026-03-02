import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

let scene, camera, controls, renderer, camMove;
let mars, atmosphere;
let phobos, deimos;
let phobosOrbit, deimosOrbit;
let raycaster, mouse, clickableObjects;
let meshNameMap = new Map();
let focusTransition;
let lockedMesh = null;
let lastLockedPos = null;
let composer, cinematicPass;
const TRANSITION_DURATION = 2000;
const rotationSpeed = 0.00012; // Mars rotates slightly slower than Earth
let boundOnClick, boundOnMouseMove;
let cbHover = null, cbBlur = null, cbFocus = null;

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(sharedRenderer) {
  renderer = sharedRenderer;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 3;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1.5;
  controls.maxDistance = 20;
  controls.enablePan = false;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // Mars — radius ~0.53 Earth, but we use 1.0 for visual presence
  const marsGeometry = new THREE.SphereGeometry(1, 64, 64);
  const marsMaterial = new THREE.MeshPhongMaterial({
    map: loader.load('/textures/mars.jpg'),
    bumpMap: loader.load('/textures/mars.jpg'),
    bumpScale: 0.02,
    shininess: 3,
  });
  mars = new THREE.Mesh(marsGeometry, marsMaterial);
  scene.add(mars);

  // Thin Martian atmosphere — CO₂ haze, dusty orange-pink
  const atmosphereGeometry = new THREE.SphereGeometry(1.015, 64, 64);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
        float glow = pow(rim, 3.0) * 1.5;
        vec3 color = mix(vec3(0.8, 0.4, 0.2), vec3(1.0, 0.7, 0.5), rim);
        gl_FragColor = vec4(color, glow * 0.4);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  scene.add(atmosphere);

  // Starfield
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // Lighting — warm sunlight, dimmer than Earth (Mars is farther from Sun)
  const sunLight = new THREE.DirectionalLight(0xffeedd, 1.6);
  sunLight.position.set(5, 1, 3);
  scene.add(sunLight);
  const ambientLight = new THREE.AmbientLight(0x0a0808, 0.25);
  scene.add(ambientLight);
  const rimLight = new THREE.DirectionalLight(0x664422, 0.3);
  rimLight.position.set(-3, -1, -2);
  scene.add(rimLight);

  // ── Phobos — Mars's inner moon (tiny, irregular)
  const phobosGeometry = new THREE.SphereGeometry(0.06, 16, 16);
  // Stretch slightly to approximate irregular shape
  phobosGeometry.scale(1.0, 0.8, 0.7);
  const phobosMaterial = new THREE.MeshPhongMaterial({
    color: 0x8a7a6a,
    shininess: 2,
  });
  phobos = new THREE.Mesh(phobosGeometry, phobosMaterial);
  scene.add(phobos);

  phobosOrbit = { radius: 2.8, speed: 0.003, inclination: 0.02, angle: 0 };

  // ── Deimos — Mars's outer moon (even tinier)
  const deimosGeometry = new THREE.SphereGeometry(0.035, 12, 12);
  deimosGeometry.scale(1.0, 0.85, 0.75);
  const deimosMaterial = new THREE.MeshPhongMaterial({
    color: 0x9a8a7a,
    shininess: 2,
  });
  deimos = new THREE.Mesh(deimosGeometry, deimosMaterial);
  scene.add(deimos);

  deimosOrbit = { radius: 5.5, speed: 0.0008, inclination: 0.03, angle: Math.PI * 0.7 };

  // Orbital track helper
  function makeOrbitLine(radius, inclination, color = 0xcc8855, opacity = 0.5) {
    const points = [];
    const segments = 256;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        radius * Math.cos(angle),
        radius * Math.sin(angle) * Math.sin(inclination),
        radius * Math.sin(angle) * Math.cos(inclination),
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    return new THREE.Line(geo, mat);
  }

  scene.add(makeOrbitLine(phobosOrbit.radius, phobosOrbit.inclination));
  scene.add(makeOrbitLine(deimosOrbit.radius, deimosOrbit.inclination));

  // Build mesh → name map
  meshNameMap = new Map();
  meshNameMap.set(mars, 'Mars');
  meshNameMap.set(phobos, 'Phobos');
  meshNameMap.set(deimos, 'Deimos');

  // Click-to-focus
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  clickableObjects = [mars, phobos, deimos];
  focusTransition = null;

  boundOnClick = (event) => {
    if (event.detail === 0) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (meshNameMap.has(obj)) focusOn(obj);
    }
  };

  boundOnMouseMove = (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);
    if (intersects.length > 0) {
      const name = meshNameMap.get(intersects[0].object);
      renderer.domElement.style.cursor = 'pointer';
      if (cbHover && name) cbHover(name, event.clientX, event.clientY);
    } else {
      renderer.domElement.style.cursor = 'default';
      if (cbBlur) cbBlur();
    }
  };

  renderer.domElement.addEventListener('click', boundOnClick);
  renderer.domElement.addEventListener('mousemove', boundOnMouseMove);

  // Post-processing (auto-stubbed on mobile)
  const post = createComposer(renderer, scene, camera);
  composer = post.composer;
  cinematicPass = post.cinematicPass;
}

export function animate() {
  const ts = sim.timeScale;

  mars.rotation.y += rotationSpeed * ts;
  atmosphere.rotation.y += rotationSpeed * ts;

  // Phobos — fast orbit (7h 39m real, very close)
  phobosOrbit.angle += phobosOrbit.speed * 0.25 * ts;
  phobos.position.set(
    phobosOrbit.radius * Math.cos(phobosOrbit.angle),
    phobosOrbit.radius * Math.sin(phobosOrbit.angle) * Math.sin(phobosOrbit.inclination),
    phobosOrbit.radius * Math.sin(phobosOrbit.angle) * Math.cos(phobosOrbit.inclination),
  );
  phobos.rotation.y += 0.0002 * ts;

  // Deimos — slower orbit (30h 18m real, farther out)
  deimosOrbit.angle += deimosOrbit.speed * 0.25 * ts;
  deimos.position.set(
    deimosOrbit.radius * Math.cos(deimosOrbit.angle),
    deimosOrbit.radius * Math.sin(deimosOrbit.angle) * Math.sin(deimosOrbit.inclination),
    deimosOrbit.radius * Math.sin(deimosOrbit.angle) * Math.cos(deimosOrbit.inclination),
  );
  deimos.rotation.y += 0.0001 * ts;

  if (focusTransition) {
    const elapsed = performance.now() - focusTransition.startTime;
    const t = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startControlsTarget, focusTransition.endControlsTarget, ease);
    camera.position.lerpVectors(focusTransition.startCamPos, focusTransition.endCamPos, ease);
    if (t >= 1) focusTransition = null;
  } else if (lockedMesh) {
    const newPos = lockedMesh.getWorldPosition(new THREE.Vector3());
    const delta = newPos.clone().sub(lastLockedPos);
    camera.position.add(delta);
    controls.target.add(delta);
    lastLockedPos = newPos.clone();
  }

  cinematicPass.uniforms.time.value = performance.now() * 0.001;

  camMove.update(0.016);
  controls.update();
  composer.render();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  let endCamPos;
  if (mesh === mars) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCamPos = clickedPos.clone().add(dir.multiplyScalar(3.5));
  } else {
    const toMarsDir = clickedPos.clone().normalize().negate();
    endCamPos = clickedPos.clone().add(toMarsDir.multiplyScalar(0.8));
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  const bodyRadius = mesh === mars ? 1.0 : 0.06;
  controls.minDistance = bodyRadius * 1.5;
  if (cbFocus) cbFocus(meshNameMap.get(mesh));
  focusTransition = {
    startTime: performance.now(),
    duration: TRANSITION_DURATION,
    startCamPos: camera.position.clone(),
    startControlsTarget: controls.target.clone(),
    endControlsTarget: clickedPos.clone(),
    endCamPos,
  };
}

export function getObjects() {
  return [
    { name: 'Mars', mesh: mars },
    { name: 'Phobos', mesh: phobos },
    { name: 'Deimos', mesh: deimos },
  ];
}

export function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(window.innerWidth, window.innerHeight);
}

export function dispose() {
  lockedMesh = null;
  lastLockedPos = null;
  renderer.domElement.removeEventListener('click', boundOnClick);
  renderer.domElement.removeEventListener('mousemove', boundOnMouseMove);
  renderer.domElement.style.cursor = 'default';
  camMove.dispose();
  controls.dispose();
  composer.dispose();
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}
