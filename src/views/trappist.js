import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// Real TRAPPIST-1 data — periods and semi-major axes are authentic.
// Visual radii and orbit scales are proportionally accurate to each other.
// Habitable zone: e, f, g (conservative–optimistic overlap).
const PLANET_DATA = [
  { name: 'TRAPPIST-1b', texture: '/textures/mars.jpg',         radius: 0.30, orbit: 4.0,  speed: 0.00500, zone: 'hot'      },
  { name: 'TRAPPIST-1c', texture: '/textures/venus.jpg',        radius: 0.30, orbit: 5.47, speed: 0.00312, zone: 'hot'      },
  { name: 'TRAPPIST-1d', texture: '/textures/mercury.jpg',      radius: 0.21, orbit: 7.71, speed: 0.00186, zone: 'warm'     },
  { name: 'TRAPPIST-1e', texture: '/textures/earth_daymap.jpg', radius: 0.25, orbit: 10.1, speed: 0.00124, zone: 'habitable'},
  { name: 'TRAPPIST-1f', texture: '/textures/neptune.jpg',      radius: 0.28, orbit: 13.3, speed: 0.00082, zone: 'habitable'},
  { name: 'TRAPPIST-1g', texture: '/textures/uranus.jpg',       radius: 0.31, orbit: 16.2, speed: 0.00061, zone: 'habitable'},
  { name: 'TRAPPIST-1h', texture: '/textures/moon.jpg',         radius: 0.20, orbit: 21.4, speed: 0.00040, zone: 'cold'     },
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

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(0, 14, 32);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── TRAPPIST-1 star — tiny ultra-cool red dwarf ──
  // 0.1192 solar radii; appears deep orange-red at 2,566 K
  const starGeo = new THREE.SphereGeometry(1.1, 64, 64);
  const starMat = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/sun.jpg'),
    color: new THREE.Color(1.0, 0.18, 0.02), // heavy red tint over sun texture
  });
  star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // Corona glow — deep red rim
  const glowGeo = new THREE.SphereGeometry(1.1, 64, 64);
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
        vec3 inner = vec3(1.0, 0.35, 0.05);
        vec3 outer = vec3(0.7, 0.08, 0.0);
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

  // Reddish point light — dim (luminosity 0.000522 L☉) but unlimited range
  const starLight = new THREE.PointLight(0xff5511, 2.8, 0, 0);
  scene.add(starLight);
  const ambientLight = new THREE.AmbientLight(0x180808, 0.18);
  scene.add(ambientLight);

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

    // Habitable zone planets get a faint blue-green atmosphere
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
            vec3 color = mix(vec3(0.15, 0.45, 0.9), vec3(0.4, 0.75, 1.0), rim);
            gl_FragColor = vec4(color, atmosphere * 0.55);
          }
        `,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
      });
      mesh.add(new THREE.Mesh(atmoGeo, atmoMat));
    }

    // Orbit line — green tint for HZ, cool blue otherwise
    const isHZ = data.zone === 'habitable';
    const orbitColor   = isHZ ? 0x66cc88 : 0xaaccdd;
    const orbitOpacity = isHZ ? 0.65     : 0.45;
    const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
    const orbitGeo   = new THREE.BufferGeometry().setFromPoints(
      orbitCurve.getPoints(256).map((p) => new THREE.Vector3(p.x, 0, p.y))
    );
    scene.add(new THREE.Line(orbitGeo,
      new THREE.LineBasicMaterial({ color: orbitColor, transparent: true, opacity: orbitOpacity })
    ));

    planets.push({ mesh, angle: Math.random() * Math.PI * 2, ...data });
  });

  // ── Starfield — equirectangular skybox ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // ── Mesh → name map ──
  meshNameMap = new Map();
  meshNameMap.set(star, 'TRAPPIST-1');
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

  // ── Post-processing ──
  // Star is 0.000522 L☉ — subtler bloom than the solar system
  const post = createComposer(renderer, scene, camera);
  composer      = post.composer;
  cinematicPass = post.cinematicPass;
  post.bloomPass.strength  = 0.9;
  post.bloomPass.threshold = 0.5;
}

export function animate() {
  const ts = sim.timeScale;

  star.rotation.y += 0.00015 * ts;

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
    // Keep transition endpoints chasing the moving planet so there's no
    // stale-delta jump when steady tracking takes over after the animation.
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
  lockedMesh    = null;
  lastLockedPos = null;
  focusTransition = null;
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
    // Anti-star positioning: camera on far side of planet from star
    const toStarDir = clickedPos.clone().normalize().negate();
    endCam = clickedPos.clone().add(toStarDir.multiplyScalar(2.0));
  }
  lockedMesh    = mesh;
  lastLockedPos = clickedPos.clone();
  const pd = planets.find((p) => p.mesh === mesh);
  controls.minDistance = (mesh === star ? 1.1 : (pd ? pd.radius : 0.25)) * 1.5;
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
    { name: 'TRAPPIST-1', mesh: star },
    ...planets.map((p) => ({ name: p.name, mesh: p.mesh })),
  ];
}
