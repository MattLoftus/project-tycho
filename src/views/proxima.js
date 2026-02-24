import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// Proxima Centauri — nearest star to the Sun (4.2465 ly)
// M5.5Ve flare star with 3 planets: d, b (habitable), c
// Features periodic stellar flare events
// ═══════════════════════════════════════════════════════════════

const PLANET_DATA = [
  { name: 'Proxima d', texture: '/textures/mercury.jpg', radius: 0.15, orbit: 2.8, speed: 0.0058,  zone: 'hot' },
  { name: 'Proxima b', texture: '/textures/earth_daymap.jpg', radius: 0.25, orbit: 5.0, speed: 0.0027, zone: 'habitable' },
  { name: 'Proxima c', texture: '/textures/neptune.jpg', radius: 0.38, orbit: 22.0, speed: 0.00016, zone: 'cold' },
];

let scene, camera, controls, renderer, camMove;
let star, starMat, starLight;
let planets = [];
let raycaster, mouse, clickableObjects;
let focusTransition;
let lockedMesh = null;
let lastLockedPos = null;
let composer, cinematicPass, bloomPass;
const TRANSITION_DURATION = 2000;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;

// Flare system
let flareTimer = 0;
let flareActive = false;
let flareBrightness = 0;
let flareDecayRate = 0;
let flareSphere = null;
let flareMat = null;
const BASE_STAR_COLOR = new THREE.Color(1.0, 0.28, 0.06);
const FLARE_STAR_COLOR = new THREE.Color(1.0, 0.7, 0.5);
const BASE_LIGHT_INTENSITY = 2.5;

function nextFlareDelay() {
  return 8 + Math.random() * 12; // 8–20 seconds
}

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(0, 12, 30);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 300;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Proxima Centauri — M5.5Ve red dwarf, hotter than TRAPPIST-1 ──
  const starGeo = new THREE.SphereGeometry(1.3, 64, 64);
  starMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/sun.jpg'),
    color: BASE_STAR_COLOR.clone(),
  });
  star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // Corona — more orange than TRAPPIST-1's deep red
  const glowGeo = new THREE.SphereGeometry(1.3, 64, 64);
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
        float glow = pow(rim, 3.0) * 2.0;
        vec3 inner = vec3(1.0, 0.45, 0.12);
        vec3 outer = vec3(0.8, 0.12, 0.02);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, glow * 0.85);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // ── Flare sphere — starts invisible, expands on flare ──
  flareMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.7, 0.4),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  flareSphere = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32), flareMat);
  flareSphere.scale.setScalar(1.5);
  scene.add(flareSphere);

  // ── Lighting ──
  starLight = new THREE.PointLight(0xff6622, BASE_LIGHT_INTENSITY, 0, 0);
  scene.add(starLight);
  scene.add(new THREE.AmbientLight(0x180808, 0.18));

  // ── Planets ──
  clickableObjects = [star];
  planets = [];

  PLANET_DATA.forEach((data) => {
    const geo = new THREE.SphereGeometry(data.radius, 32, 32);
    const mat = new THREE.MeshPhongMaterial({
      map: loader.load(data.texture),
      shininess: 8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    clickableObjects.push(mesh);

    // Habitable zone atmosphere — blue-green with slight reddish tint from M-dwarf
    if (data.zone === 'habitable') {
      const atmoGeo = new THREE.SphereGeometry(data.radius * 1.08, 32, 32);
      const atmoMat = new THREE.ShaderMaterial({
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
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 viewDir = normalize(-vPosition);
            float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
            float atmosphere = pow(rim, 2.5) * 1.8;
            // Slightly warmer than pure blue due to M-dwarf irradiation
            vec3 color = mix(vec3(0.2, 0.4, 0.85), vec3(0.45, 0.65, 0.9), rim);
            gl_FragColor = vec4(color, atmosphere * 0.55);
          }
        `,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
      });
      mesh.add(new THREE.Mesh(atmoGeo, atmoMat));
    }

    // Orbit lines
    const isHZ = data.zone === 'habitable';
    const orbitColor = isHZ ? 0x66cc88 : (data.zone === 'hot' ? 0xff6622 : 0xaaccdd);
    const orbitOpacity = isHZ ? 0.65 : 0.40;
    const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(
      orbitCurve.getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y))
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
  meshNameMap.set(star, 'Proxima Centauri');
  planets.forEach((p) => meshNameMap.set(p.mesh, p.name));

  // ── Input ──
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  focusTransition = null;
  flareTimer = nextFlareDelay();
  flareActive = false;
  flareBrightness = 0;

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
  bloomPass.strength = 1.0;
  bloomPass.threshold = 0.5;
}

export function animate() {
  const ts = sim.timeScale;
  const dt = 0.016;

  star.rotation.y += 0.00015 * ts;

  // ── Stellar flare system ──
  flareTimer -= dt * ts;
  if (flareTimer <= 0 && !flareActive) {
    flareActive = true;
    flareBrightness = 1.0;
    flareDecayRate = 0.3 + Math.random() * 0.2; // 2-4 second decay
    flareSphere.scale.setScalar(1.5);
  }

  if (flareActive) {
    flareBrightness -= flareDecayRate * dt * ts;
    if (flareBrightness <= 0.01) {
      flareBrightness = 0;
      flareActive = false;
      flareTimer = nextFlareDelay();
    }

    // Lerp star color toward white-yellow
    const t = flareBrightness;
    starMat.color.copy(BASE_STAR_COLOR).lerp(FLARE_STAR_COLOR, t);

    // Spike light intensity
    starLight.intensity = BASE_LIGHT_INTENSITY + 5.5 * t;

    // Expand and fade flare sphere
    flareMat.opacity = t * 0.5;
    const flareScale = 1.5 + (1.0 - t) * 3.0;
    flareSphere.scale.setScalar(flareScale);
  } else {
    starMat.color.copy(BASE_STAR_COLOR);
    starLight.intensity = BASE_LIGHT_INTENSITY;
    flareMat.opacity = 0;
  }

  // ── Planet orbits ──
  planets.forEach((planet) => {
    planet.angle += planet.speed * 0.25 * ts;
    planet.mesh.position.set(
      planet.orbit * Math.cos(planet.angle),
      0,
      planet.orbit * Math.sin(planet.angle)
    );
    planet.mesh.rotation.y += 0.0015 * ts;
  });

  // ── Focus transition ──
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
  flareActive = false;
  flareBrightness = 0;
  camMove.dispose();
  scene.clear();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  let endCam;
  if (mesh === star) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCam = clickedPos.clone().add(dir.multiplyScalar(6));
  } else {
    const toStarDir = clickedPos.clone().normalize().negate();
    endCam = clickedPos.clone().add(toStarDir.multiplyScalar(2.0));
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  const pd = planets.find((p) => p.mesh === mesh);
  controls.minDistance = (mesh === star ? 1.3 : (pd ? pd.radius : 0.25)) * 1.5;
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
    { name: 'Proxima Centauri', mesh: star },
    ...planets.map((p) => ({ name: p.name, mesh: p.mesh })),
  ];
}
