import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// Kepler-16 — A circumbinary system 245 ly away, nicknamed "Tatooine".
// Kepler-16A: K-type star (0.69 M☉, 4450 K, orange-yellow).
// Kepler-16B: M-type companion (0.20 M☉, 3311 K, deep red).
// Kepler-16b: Saturn-mass circumbinary planet in a P-type orbit.
// Binary period ~41 days; planet period ~229 days. Ratio ≈ 5.57:1.

// ── Scale ──
// Binary total separation mapped to 5 scene units (A at 1.14, B at 3.86).
// Planet orbit: 5 * (0.7048 AU / 0.2243 AU) ≈ 15.7 scene units.
const A_DIST       = 1.14;  // Kepler-16A distance from barycenter
const B_DIST       = 3.86;  // Kepler-16B distance from barycenter
const PLANET_ORBIT = 15.7;  // Kepler-16b orbit radius from barycenter
const BINARY_SPEED = 0.0020; // rad/frame base (scale against timeScale * 0.25)
const PLANET_SPEED = BINARY_SPEED / 5.569; // ≈ 0.000359 — period ratio 229/41

let scene, camera, controls, renderer, camMove;
let starA, starB, planet;
let starALight, starBLight;
let binaryAngle = 0;
let planetAngle  = Math.PI * 0.7; // start planet away from binary pair
let raycaster, mouse, clickableObjects;
let focusTransition;
let lockedMesh = null, lastLockedPos = null;
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
  scene    = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 18, 48);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance   = 0.5;
  controls.maxDistance   = 400;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Kepler-16A — K-type, orange-yellow, 4,450 K ──
  const aGeo = new THREE.SphereGeometry(1.8, 64, 64);
  const aMat = new THREE.MeshBasicMaterial({
    map:   loader.load('/textures/sun.jpg'),
    color: new THREE.Color(1.0, 0.70, 0.25),  // warm orange-yellow K-type
  });
  starA = new THREE.Mesh(aGeo, aMat);
  scene.add(starA);

  // Orange corona
  starA.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 64, 64),
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal; varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal; varying vec3 vViewDir;
        void main() {
          float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
          float g = pow(rim, 2.8) * 2.2;
          vec3 inner = vec3(1.0, 0.75, 0.25);
          vec3 outer = vec3(0.9, 0.35, 0.05);
          gl_FragColor = vec4(mix(inner, outer, rim), g * 0.85);
        }
      `,
      transparent: true, side: THREE.FrontSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  ));

  starALight = new THREE.PointLight(0xffaa44, 3.2, 0, 1.6);
  scene.add(starALight);

  // ── Kepler-16B — M-type, deep red, 3,311 K ──
  const bGeo = new THREE.SphereGeometry(0.72, 48, 48);
  const bMat = new THREE.MeshBasicMaterial({
    map:   loader.load('/textures/sun.jpg'),
    color: new THREE.Color(1.0, 0.22, 0.04),  // deep red M-type
  });
  starB = new THREE.Mesh(bGeo, bMat);
  scene.add(starB);

  // Red corona
  starB.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 48, 48),
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal; varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal; varying vec3 vViewDir;
        void main() {
          float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
          float g = pow(rim, 3.0) * 2.0;
          gl_FragColor = vec4(1.0, 0.15, 0.02, g * 0.9);
        }
      `,
      transparent: true, side: THREE.FrontSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  ));

  starBLight = new THREE.PointLight(0xff3300, 1.4, 0, 2.0);
  scene.add(starBLight);

  const ambientLight = new THREE.AmbientLight(0x060408, 0.2);
  scene.add(ambientLight);

  // ── Kepler-16b — Saturn-mass circumbinary planet ──
  const pGeo = new THREE.SphereGeometry(0.95, 48, 48);
  const pMat = new THREE.MeshPhongMaterial({
    map:       loader.load('/textures/saturn.jpg'),
    shininess: 14,
  });
  planet = new THREE.Mesh(pGeo, pMat);
  scene.add(planet);

  // Rings — Saturn-like; attached as child so they track planet position
  const ringGeo = new THREE.RingGeometry(1.32, 2.42, 128);
  const rPos = ringGeo.attributes.position;
  const rUV  = ringGeo.attributes.uv;
  for (let i = 0; i < rPos.count; i++) {
    const x = rPos.getX(i), y = rPos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    rUV.setXY(i, (r - 1.32) / (2.42 - 1.32), Math.atan2(y, x) / (Math.PI * 2));
  }
  const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color:       0xc8a86a,
    transparent: true,
    opacity:     0.55,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  }));
  ringMesh.rotation.x = Math.PI / 2;
  // Tilt rings ~26° — Saturn-like axial tilt
  planet.add(ringMesh);
  planet.rotation.z = THREE.MathUtils.degToRad(26);

  // ── Orbit lines ──
  function orbitLine(radius, color, opacity, segments = 256) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }

  scene.add(orbitLine(PLANET_ORBIT, 0xaabbcc, 0.28));
  scene.add(orbitLine(A_DIST,       0xffaa44, 0.30, 128));
  scene.add(orbitLine(B_DIST,       0xff3300, 0.22, 128));

  // ── Starfield ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(starA,  'Kepler-16A');
  meshNameMap.set(starB,  'Kepler-16B');
  meshNameMap.set(planet, 'Kepler-16b');
  clickableObjects = [starA, starB, planet];

  // ── Input ──
  raycaster    = new THREE.Raycaster();
  mouse        = new THREE.Vector2();
  focusTransition = null;

  boundOnClick = (event) => {
    if (event.detail === 0) return;
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) {
      const obj    = hits[0].object;
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
      const obj  = hits[0].object;
      const name = meshNameMap.get(obj) ?? meshNameMap.get(obj.parent);
      renderer.domElement.style.cursor = 'pointer';
      if (cbHover && name) cbHover(name, event.clientX, event.clientY);
    } else {
      renderer.domElement.style.cursor = 'default';
      if (cbBlur) cbBlur();
    }
  };

  renderer.domElement.addEventListener('click',     boundOnClick);
  renderer.domElement.addEventListener('mousemove', boundOnMouseMove);

  // ── Post-processing — warm tones, strong bloom for the dual suns ──
  const post = createComposer(renderer, scene, camera);
  composer      = post.composer;
  cinematicPass = post.cinematicPass;
  post.bloomPass.strength  = 1.8;
  post.bloomPass.threshold = 0.48;
  // Warm color grade — lift shadows toward amber
  cinematicPass.uniforms.liftR.value = 1.02;
  cinematicPass.uniforms.liftG.value = 0.97;
  cinematicPass.uniforms.liftB.value = 0.90;
}

export function animate() {
  const ts = sim.timeScale;
  binaryAngle += BINARY_SPEED * 0.25 * ts;
  planetAngle  += PLANET_SPEED  * 0.25 * ts;

  // Binary pair — always on opposite sides of barycenter
  starA.position.set( Math.cos(binaryAngle)         * A_DIST, 0,  Math.sin(binaryAngle)         * A_DIST);
  starB.position.set( Math.cos(binaryAngle + Math.PI) * B_DIST, 0, Math.sin(binaryAngle + Math.PI) * B_DIST);
  starALight.position.copy(starA.position);
  starBLight.position.copy(starB.position);
  starA.rotation.y += 0.00015 * ts;
  starB.rotation.y += 0.00030 * ts;

  // Circumbinary planet
  planet.position.set(
    Math.cos(planetAngle) * PLANET_ORBIT, 0,
    Math.sin(planetAngle) * PLANET_ORBIT,
  );
  planet.rotation.y += 0.0006 * ts;

  // ── Camera tracking (focus transitions + locked follow) ──
  if (focusTransition) {
    if (lockedMesh && lastLockedPos) {
      const newPos = lockedMesh.getWorldPosition(new THREE.Vector3());
      const delta  = newPos.clone().sub(lastLockedPos);
      focusTransition.endCam.add(delta);
      focusTransition.endTarget.add(delta);
      lastLockedPos = newPos.clone();
    }
    const elapsed = performance.now() - focusTransition.startTime;
    const t    = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startTarget, focusTransition.endTarget, ease);
    camera.position.lerpVectors(focusTransition.startCam, focusTransition.endCam, ease);
    if (t >= 1) focusTransition = null;
  } else if (lockedMesh) {
    const newPos = lockedMesh.getWorldPosition(new THREE.Vector3());
    const delta  = newPos.clone().sub(lastLockedPos);
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
  renderer.domElement.removeEventListener('click',     boundOnClick);
  renderer.domElement.removeEventListener('mousemove', boundOnMouseMove);
  renderer.domElement.style.cursor = 'default';
  lockedMesh = null; lastLockedPos = null; focusTransition = null;
  camMove.dispose();
  scene.clear();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  let pullBack, minDist;

  if      (mesh === starA)  { pullBack = 12; minDist = 1.8 * 1.5; }
  else if (mesh === starB)  { pullBack =  6; minDist = 0.72 * 1.5; }
  else                      { pullBack = 10; minDist = 0.95 * 2.0; }

  const endCam = clickedPos.clone().add(dir.multiplyScalar(pullBack));

  lockedMesh    = mesh;
  lastLockedPos = clickedPos.clone();
  controls.minDistance = minDist;
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
    { name: 'Kepler-16A', mesh: starA  },
    { name: 'Kepler-16B', mesh: starB  },
    { name: 'Kepler-16b', mesh: planet },
  ];
}
