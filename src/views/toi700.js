import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// ═══════════════════════════════════════════════════════════════
// TOI-700 — M2V red dwarf, 101.4 ly away
// TESS discovery (2020). 4 planets, two in the habitable zone.
// TOI-700 d was the first Earth-size HZ planet found by TESS.
// TOI-700 e confirmed 2023, also HZ (optimistic).
// ═══════════════════════════════════════════════════════════════

const PLANET_DATA = [
  // b — super-Earth, too hot (1.01 R⊕, 9.977 d)
  { name: 'TOI-700 b', texture: '/textures/mars.jpg',          radius: 0.24, orbit: 3.5,  speed: 0.004000, zone: 'hot' },
  // c — mini-Neptune (2.63 R⊕, 16.051 d)
  { name: 'TOI-700 c', texture: '/textures/neptune.jpg',       radius: 0.45, orbit: 6.0,  speed: 0.002488, zone: 'warm' },
  // e — Earth-size, optimistic habitable zone (0.953 R⊕, 28.396 d)
  { name: 'TOI-700 e', texture: '/textures/earth_daymap.jpg',  radius: 0.22, orbit: 9.5,  speed: 0.001407, zone: 'habitable' },
  // d — Earth-size, conservative habitable zone (1.19 R⊕, 37.426 d)
  { name: 'TOI-700 d', texture: '/textures/earth_daymap.jpg',  radius: 0.26, orbit: 13.5, speed: 0.001067, zone: 'habitable' },
];

let scene, camera, controls, renderer, camMove;
let star;
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

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(0, 10, 25);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 300;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── TOI-700 — M2V red dwarf, cooler than Proxima but warmer than TRAPPIST-1 ──
  const starGeo = new THREE.SphereGeometry(1.0, 64, 64);
  const starMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/sun.jpg'),
    color: new THREE.Color(1.0, 0.35, 0.10),
  });
  star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // Corona — deep red-orange glow
  const glowGeo = new THREE.SphereGeometry(1.0, 64, 64);
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
        vec3 inner = vec3(1.0, 0.40, 0.12);
        vec3 outer = vec3(0.7, 0.10, 0.02);
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

  // ── Lighting ──
  scene.add(new THREE.PointLight(0xff5522, 2.0, 0, 0));
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

    // Habitable zone atmosphere — blue-green with M-dwarf warmth
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
      precision mediump float;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 viewDir = normalize(-vPosition);
            float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
            float atmosphere = pow(rim, 2.5) * 1.8;
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
    const orbitColor = isHZ ? 0x66cc88 : (data.zone === 'hot' ? 0xff6622 : 0xddcc66);
    const orbitOpacity = isHZ ? 0.65 : 0.40;
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
  meshNameMap.set(star, 'TOI-700');
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

  star.rotation.y += 0.00008 * ts;

  planets.forEach((planet) => {
    planet.angle += planet.speed * 0.25 * ts;
    planet.mesh.position.set(
      planet.orbit * Math.cos(planet.angle),
      0,
      planet.orbit * Math.sin(planet.angle)
    );
    planet.mesh.rotation.y += 0.0015 * ts;
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
  lockedMesh = null; lastLockedPos = null; focusTransition = null;
  camMove.dispose();
  scene.clear();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  let endCam;
  if (mesh === star) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCam = clickedPos.clone().add(dir.multiplyScalar(5));
  } else {
    const toStarDir = clickedPos.clone().normalize().negate();
    endCam = clickedPos.clone().add(toStarDir.multiplyScalar(2.0));
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  const pd = planets.find((p) => p.mesh === mesh);
  controls.minDistance = (mesh === star ? 1.0 : (pd ? pd.radius : 0.25)) * 1.5;
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
    { name: 'TOI-700', mesh: star },
    ...planets.map((p) => ({ name: p.name, mesh: p.mesh })),
  ];
}
