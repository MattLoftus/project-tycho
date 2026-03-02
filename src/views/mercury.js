import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

let scene, camera, controls, renderer, camMove;
let mercury;
let raycaster, mouse, clickableObjects;
let meshNameMap = new Map();
let focusTransition;
let lockedMesh = null;
let lastLockedPos = null;
let composer, cinematicPass;
const TRANSITION_DURATION = 2000;
const rotationSpeed = 0.000017; // Mercury rotates very slowly (58.6 days)
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

  // Mercury — smallest planet, heavily cratered, no atmosphere
  const mercuryGeometry = new THREE.SphereGeometry(1, 64, 64);
  const mercuryMaterial = new THREE.MeshPhongMaterial({
    map: loader.load('/textures/mercury.jpg'),
    bumpMap: loader.load('/textures/mercury.jpg'),
    bumpScale: 0.03,
    shininess: 5,
  });
  mercury = new THREE.Mesh(mercuryGeometry, mercuryMaterial);
  scene.add(mercury);

  // Starfield
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // Lighting — very bright sunlight (Mercury is closest to the Sun)
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  sunLight.position.set(5, 1, 3);
  scene.add(sunLight);
  const ambientLight = new THREE.AmbientLight(0x0a0a0a, 0.2);
  scene.add(ambientLight);
  const rimLight = new THREE.DirectionalLight(0x445566, 0.2);
  rimLight.position.set(-3, -1, -2);
  scene.add(rimLight);

  // Build mesh → name map
  meshNameMap = new Map();
  meshNameMap.set(mercury, 'Mercury');

  // Click-to-focus
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  clickableObjects = [mercury];
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

  mercury.rotation.y += rotationSpeed * ts;

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
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCamPos = clickedPos.clone().add(dir.multiplyScalar(3.5));
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  controls.minDistance = 1.5;
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
    { name: 'Mercury', mesh: mercury },
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
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = null;
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        for (const key of Object.keys(m)) {
          if (m[key] && m[key].isTexture) m[key].dispose();
        }
        m.dispose();
      });
    }
  });
}
