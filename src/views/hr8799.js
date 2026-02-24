import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// HR 8799 — A5V star 129 ly away, age ~30–60 million years.
// The 4 planets (e, d, c, b) were directly photographed — the first multi-planet
// system ever imaged. They are young self-luminous super-Jupiters at wide orbits.
// Orbital periods and semi-major axis ratios are authentic (near 1:2:4:8 resonance).
const PLANET_DATA = [
  { name: 'HR 8799e', texture: '/textures/jupiter.jpg', radius: 0.72, orbit: 8,  speed: 0.001200 },
  { name: 'HR 8799d', texture: '/textures/saturn.jpg',  radius: 0.72, orbit: 13, speed: 0.000541 },
  { name: 'HR 8799c', texture: '/textures/neptune.jpg', radius: 0.68, orbit: 21, speed: 0.000284 },
  { name: 'HR 8799b', texture: '/textures/uranus.jpg',  radius: 0.62, orbit: 38, speed: 0.000118 },
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
  camera.position.set(0, 20, 60);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 500;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── HR 8799 star — A5V, blue-white, 7430 K, 4.92 L☉ ──
  const starGeo = new THREE.SphereGeometry(2.4, 64, 64);
  const starMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/sun.jpg'),
    color: new THREE.Color(0.82, 0.92, 1.0), // blue-white tint (A-type, 7430 K)
  });
  star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // Blue-white corona
  const glowGeo = new THREE.SphereGeometry(2.4, 64, 64);
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
        float glow = pow(rim, 3.5) * 2.0;
        vec3 inner = vec3(0.85, 0.95, 1.0);
        vec3 outer = vec3(0.4, 0.65, 1.0);
        gl_FragColor = vec4(mix(inner, outer, rim), glow * 0.8);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // Bright blue-white light — A-type star is luminous (4.92 L☉)
  const starLight = new THREE.PointLight(0xd0e8ff, 3.5, 0, 0);
  scene.add(starLight);
  const ambientLight = new THREE.AmbientLight(0x060810, 0.15);
  scene.add(ambientLight);

  // ── Planets — young, hot, self-luminous super-Jupiters ──
  clickableObjects = [star];
  planets = [];

  PLANET_DATA.forEach((data) => {
    const geo = new THREE.SphereGeometry(data.radius, 32, 32);
    const mat = new THREE.MeshPhongMaterial({
      map: loader.load(data.texture),
      // These planets radiate their own heat (~1000–1150 K from residual formation energy)
      emissive: new THREE.Color(0.25, 0.1, 0.0),
      emissiveIntensity: 0.3,
      shininess: 8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    clickableObjects.push(mesh);

    // Faint warm glow — visible in direct imaging due to self-luminosity
    const haloGeo = new THREE.SphereGeometry(data.radius * 1.12, 32, 32);
    const haloMat = new THREE.ShaderMaterial({
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
          float g = pow(rim, 3.0) * 1.2;
          gl_FragColor = vec4(0.9, 0.5, 0.1, g * 0.4);
        }
      `,
      transparent: true, side: THREE.FrontSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    mesh.add(new THREE.Mesh(haloGeo, haloMat));

    // Orbit lines
    const curve  = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(
      curve.getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y))
    );
    scene.add(new THREE.Line(orbitGeo,
      new THREE.LineBasicMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.4 })
    ));

    planets.push({ mesh, angle: Math.random() * Math.PI * 2, ...data });
  });

  // ── Debris disk — HR 8799 has a known circumstellar disk ──
  // Inner warm dust belt + outer cold disk; represented here as a faint ring
  const diskInner = 48, diskOuter = 72;
  const diskGeo = new THREE.RingGeometry(diskInner, diskOuter, 128);
  // Remap UVs so texture wraps radially
  const diskPos = diskGeo.attributes.position;
  const diskUV  = diskGeo.attributes.uv;
  for (let i = 0; i < diskPos.count; i++) {
    const x = diskPos.getX(i), y = diskPos.getY(i);
    const r = Math.sqrt(x*x + y*y);
    diskUV.setXY(i, (r - diskInner) / (diskOuter - diskInner), Math.atan2(y, x) / (Math.PI * 2));
  }
  const diskMat = new THREE.MeshBasicMaterial({
    color: 0x8899aa,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disk = new THREE.Mesh(diskGeo, diskMat);
  disk.rotation.x = -Math.PI / 2;
  scene.add(disk);

  // ── Starfield — equirectangular skybox ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(star, 'HR 8799');
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

  renderer.domElement.addEventListener('click', boundOnClick);
  renderer.domElement.addEventListener('mousemove', boundOnMouseMove);

  // Post-processing — cool blue tones, strong bloom (bright A-star)
  const post = createComposer(renderer, scene, camera);
  composer      = post.composer;
  cinematicPass = post.cinematicPass;
  post.bloomPass.strength  = 1.4;
  post.bloomPass.threshold = 0.55;
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
    planet.mesh.rotation.y += 0.0005 * ts;
  });

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
    endCam = clickedPos.clone().add(dir.multiplyScalar(12));
  } else {
    const pd   = planets.find((p) => p.mesh === mesh);
    const dist = Math.max(3.0, pd ? pd.radius * 10 : 3.0);
    const toStarDir = clickedPos.clone().normalize().negate();
    endCam = clickedPos.clone().add(toStarDir.multiplyScalar(dist));
  }
  lockedMesh    = mesh;
  lastLockedPos = clickedPos.clone();
  const pd = planets.find((p) => p.mesh === mesh);
  controls.minDistance = (mesh === star ? 2.4 : (pd ? pd.radius : 0.5)) * 1.5;
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
    { name: 'HR 8799', mesh: star },
    ...planets.map((p) => ({ name: p.name, mesh: p.mesh })),
  ];
}
