import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';
import { createFlythrough } from '../flythrough.js';
import { createMissionPlanner } from '../mission-planner.js';

let scene, camera, controls, renderer, camMove;
let flythrough;
let missionPlanner;
let sun;
let planets = [];
let jupiterMoons = [];
let earthMoons = [];
let saturnMoons = [];
let marsMoons = [];
let raycaster, mouse, clickableObjects;
let focusTransition;
let lockedMesh = null;      // body the camera is following
let lastLockedPos = null;   // its world position last frame
let composer, cinematicPass;
const TRANSITION_DURATION = 2000;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

const MARS_MOON_DATA = [
  // Phobos orbits faster than Mars rotates (7.65 hr period) — innermost, larger
  { name: 'Phobos', radius: 0.028, orbit: 0.45, speed: 0.0320 },
  // Deimos — outer, slower, smaller; period ratio ~3.96:1 vs Phobos
  { name: 'Deimos', radius: 0.020, orbit: 0.75, speed: 0.0081 },
];

const SATURN_MOON_DATA = [
  // Ordered innermost to outermost — all placed outside Saturn's rings (1.32 scene units)
  // Period ratios authentic: Mimas:Enceladus:Tethys:Dione:Rhea:Titan:Iapetus ≈ 1:1.45:2:2.9:4.8:16.9:84.2
  { name: 'Mimas',     radius: 0.035, orbit: 1.65, speed: 0.0250,   emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0 }, // "Death Star" moon
  { name: 'Enceladus', radius: 0.040, orbit: 2.05, speed: 0.0172,   emissive: new THREE.Color(0.05, 0.12, 0.25), emissiveIntensity: 0.35 }, // bright white, active geysers
  { name: 'Tethys',    radius: 0.055, orbit: 2.55, speed: 0.0125,   emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0 }, // mostly water ice
  { name: 'Dione',     radius: 0.055, orbit: 3.05, speed: 0.00863,  emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0 }, // icy, streaked surface
  { name: 'Rhea',      radius: 0.065, orbit: 3.85, speed: 0.00522,  emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0 }, // second largest
  { name: 'Titan',     radius: 0.120, orbit: 6.5,  speed: 0.00148,  emissive: new THREE.Color(0.45, 0.25, 0.0 ), emissiveIntensity: 0.55 }, // largest, thick orange haze
  { name: 'Iapetus',   radius: 0.065, orbit: 10.5, speed: 0.000297, emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0 }, // two-toned, outermost large moon
];

const EARTH_MOON_DATA = [
  // The Moon — tidally locked, grey, orbit compressed for visibility
  { name: 'Moon', radius: 0.09, orbit: 1.0, speed: 0.004 },
];

const MOON_DATA = [
  // Galilean moons — orbit radii compressed for visibility, period ratios preserved (1:2:4:9.4)
  { name: 'Io',       radius: 0.09,  orbit: 1.5, speed: 0.0080,  texture: '/textures/io.jpg',       bump: null,                          emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0  },
  { name: 'Europa',   radius: 0.075, orbit: 2.4, speed: 0.0040,  texture: '/textures/europa.jpg',   bump: '/textures/europa_bump.jpg',   emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0  },
  { name: 'Ganymede', radius: 0.12,  orbit: 3.8, speed: 0.0020,  texture: '/textures/ganymede.jpg', bump: '/textures/ganymede_bump.jpg', emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0  },
  { name: 'Callisto', radius: 0.11,  orbit: 6.6, speed: 0.00086, texture: '/textures/callisto.png', bump: '/textures/callisto_bump.png', emissive: new THREE.Color(0.0,  0.0,  0.0 ), emissiveIntensity: 0.0  },
];

const PLANET_DATA = [
  { name: 'Mercury', texture: '/textures/mercury.jpg', radius: 0.15, orbit: 6,   speed: 0.0012, inclination: 0.12 },
  { name: 'Venus',   texture: '/textures/venus.jpg',   radius: 0.25, orbit: 9,   speed: 0.0009, inclination: 0.06 },
  { name: 'Earth',   texture: '/textures/earth_daymap.jpg', radius: 0.27, orbit: 12, speed: 0.0007, inclination: 0.0, hasAtmosphere: true },
  { name: 'Mars',    texture: '/textures/mars.jpg',    radius: 0.18, orbit: 16,  speed: 0.0005, inclination: 0.03 },
  { name: 'Jupiter', texture: '/textures/jupiter.jpg', radius: 0.7,  orbit: 24,  speed: 0.00025, inclination: 0.02 },
  { name: 'Saturn',  texture: '/textures/saturn.jpg',  radius: 0.6,  orbit: 34,  speed: 0.00015, inclination: 0.04, hasRings: true },
  { name: 'Uranus',  texture: '/textures/uranus.jpg',  radius: 0.4,  orbit: 44,  speed: 0.0001, inclination: 0.01 },
  { name: 'Neptune', texture: '/textures/neptune.jpg', radius: 0.38, orbit: 54,  speed: 0.00007, inclination: 0.03 },
];

export function init(sharedRenderer) {
  renderer = sharedRenderer;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 40, 60);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 3;
  controls.maxDistance = 200;
  controls.enablePan = true;
  camMove = createCameraMovement(camera, controls);
  flythrough = createFlythrough();
  missionPlanner = createMissionPlanner();

  const loader = new THREE.TextureLoader();

  // Sun — emissive textured sphere with high bloom
  const sunGeometry = new THREE.SphereGeometry(2, 64, 64);
  const sunMaterial = new THREE.MeshBasicMaterial({ map: loader.load('/textures/sun.jpg') });
  sun = new THREE.Mesh(sunGeometry, sunMaterial);
  scene.add(sun);

  // Sun corona — single smooth glow using FrontSide rim shader
  const coronaGeo = new THREE.SphereGeometry(2.8, 64, 64);
  const coronaMat = new THREE.ShaderMaterial({
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
        // Smooth falloff: bright at edge, fades quickly inward
        float glow = pow(rim, 3.5);
        vec3 inner = vec3(1.0, 0.9, 0.5);
        vec3 outer = vec3(1.0, 0.5, 0.1);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, glow * 0.7);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Mesh(coronaGeo, coronaMat));

  // Sun light — warm, intense
  // decay=0 so light reaches all planets regardless of distance
  const sunLight = new THREE.PointLight(0xffeedd, 2.0, 0, 0);
  scene.add(sunLight);
  const ambientLight = new THREE.AmbientLight(0x080812, 0.1);
  scene.add(ambientLight);

  // Planets
  clickableObjects = [sun];
  planets = [];

  PLANET_DATA.forEach((data) => {
    const geometry = new THREE.SphereGeometry(data.radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({
      map: loader.load(data.texture),
      shininess: 8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    clickableObjects.push(mesh);

    // Atmosphere for Earth
    if (data.hasAtmosphere) {
      const atmoGeometry = new THREE.SphereGeometry(data.radius * 1.06, 32, 32);
      const atmoMaterial = new THREE.ShaderMaterial({
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
            float atmosphere = pow(rim, 2.5) * 2.0;
            vec3 color = mix(vec3(0.2, 0.5, 1.0), vec3(0.5, 0.8, 1.0), rim);
            gl_FragColor = vec4(color, atmosphere * 0.6);
          }
        `,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
      });
      mesh.add(new THREE.Mesh(atmoGeometry, atmoMaterial));
    }

    // Saturn rings
    if (data.hasRings) {
      const ringGeometry = new THREE.RingGeometry(data.radius * 1.4, data.radius * 2.2, 64);
      const pos = ringGeometry.attributes.position;
      const uv = ringGeometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const dist = Math.sqrt(x * x + y * y);
        uv.setXY(i, (dist - data.radius * 1.4) / (data.radius * 0.8), 0.5);
      }
      const ringTexture = loader.load('/textures/saturn_ring.png');
      const ringMaterial = new THREE.MeshBasicMaterial({
        map: ringTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2.3;
      mesh.add(ring);
    }

    // Orbit line — subtle dashed look
    const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2, false, 0);
    const orbitPoints = orbitCurve.getPoints(256);
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
      orbitPoints.map((p) => new THREE.Vector3(p.x, 0, p.y))
    );
    const orbitLine = new THREE.Line(
      orbitGeometry,
      new THREE.LineBasicMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.55 })
    );
    orbitLine.rotation.x = -data.inclination;
    scene.add(orbitLine);

    planets.push({ mesh, angle: Math.random() * Math.PI * 2, ...data });
  });

  // ── Galilean moons of Jupiter ──
  jupiterMoons = [];
  const jupiterPlanet = planets.find((p) => p.name === 'Jupiter');
  if (jupiterPlanet) {
    MOON_DATA.forEach((data) => {
      const geo = new THREE.SphereGeometry(data.radius, 24, 24);
      const mat = new THREE.MeshPhongMaterial({
        map:               loader.load(data.texture),
        bumpMap:           data.bump ? loader.load(data.bump) : null,
        bumpScale:         data.bump ? 0.6 : 0,
        emissive:          data.emissive,
        emissiveIntensity: data.emissiveIntensity,
        shininess: 5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      clickableObjects.push(mesh);

      // Orbit ring — thin, faint, positioned relative to Jupiter each frame
      const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(
        orbitCurve.getPoints(128).map((p) => new THREE.Vector3(p.x, 0, p.y))
      );
      const orbitLine = new THREE.LineLoop(orbitGeo,
        new THREE.LineBasicMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.6 })
      );
      scene.add(orbitLine);

      jupiterMoons.push({ mesh, orbitLine, angle: Math.random() * Math.PI * 2, ...data });
    });
  }

  // ── Earth's Moon ──
  earthMoons = [];
  const earthPlanet = planets.find((p) => p.name === 'Earth');
  if (earthPlanet) {
    EARTH_MOON_DATA.forEach((data) => {
      const geo = new THREE.SphereGeometry(data.radius, 24, 24);
      const mat = new THREE.MeshPhongMaterial({
        map: loader.load('/textures/moon.jpg'),
        shininess: 3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      clickableObjects.push(mesh);

      const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(
        orbitCurve.getPoints(128).map((p) => new THREE.Vector3(p.x, 0, p.y))
      );
      const orbitLine = new THREE.LineLoop(orbitGeo,
        new THREE.LineBasicMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.6 })
      );
      scene.add(orbitLine);

      earthMoons.push({ mesh, orbitLine, angle: Math.random() * Math.PI * 2, ...data });
    });
  }

  // ── Mars's moons ──
  marsMoons = [];
  const marsPlanet = planets.find((p) => p.name === 'Mars');
  if (marsPlanet) {
    MARS_MOON_DATA.forEach((data) => {
      const geo = new THREE.SphereGeometry(data.radius, 16, 16);
      const mat = new THREE.MeshPhongMaterial({
        map: loader.load('/textures/moon.jpg'),
        shininess: 3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      clickableObjects.push(mesh);

      const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(
        orbitCurve.getPoints(128).map((p) => new THREE.Vector3(p.x, 0, p.y))
      );
      const orbitLine = new THREE.LineLoop(orbitGeo,
        new THREE.LineBasicMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.6 })
      );
      scene.add(orbitLine);

      marsMoons.push({ mesh, orbitLine, angle: Math.random() * Math.PI * 2, ...data });
    });
  }

  // ── Saturn's moons ──
  saturnMoons = [];
  const saturnPlanet = planets.find((p) => p.name === 'Saturn');
  if (saturnPlanet) {
    SATURN_MOON_DATA.forEach((data) => {
      const geo = new THREE.SphereGeometry(data.radius, 24, 24);
      const mat = new THREE.MeshPhongMaterial({
        map: loader.load('/textures/moon.jpg'),
        emissive: data.emissive,
        emissiveIntensity: data.emissiveIntensity,
        shininess: 5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      clickableObjects.push(mesh);

      const orbitCurve = new THREE.EllipseCurve(0, 0, data.orbit, data.orbit, 0, Math.PI * 2);
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(
        orbitCurve.getPoints(128).map((p) => new THREE.Vector3(p.x, 0, p.y))
      );
      const orbitLine = new THREE.LineLoop(orbitGeo,
        new THREE.LineBasicMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.6 })
      );
      scene.add(orbitLine);

      saturnMoons.push({ mesh, orbitLine, angle: Math.random() * Math.PI * 2, ...data });
    });
  }

  // ── Starfield — equirectangular skybox ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // Build mesh → name map
  meshNameMap = new Map();
  meshNameMap.set(sun, 'Sun');
  planets.forEach((p) => meshNameMap.set(p.mesh, p.name));
  jupiterMoons.forEach((m) => meshNameMap.set(m.mesh, m.name));
  earthMoons.forEach((m) => meshNameMap.set(m.mesh, m.name));
  marsMoons.forEach((m) => meshNameMap.set(m.mesh, m.name));
  saturnMoons.forEach((m) => meshNameMap.set(m.mesh, m.name));

  // Click-to-focus
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  focusTransition = null;

  boundOnClick = (event) => {
    if (event.detail === 0) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      const target = meshNameMap.has(obj) ? obj : obj.parent;
      if (meshNameMap.has(target)) focusOn(target);
    }
  };

  boundOnMouseMove = (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
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

  // Post-processing
  const post = createComposer(renderer, scene, camera);
  composer = post.composer;
  cinematicPass = post.cinematicPass;
  // Stronger bloom for the solar system — sun should really glow
  post.bloomPass.strength = 1.2;
  post.bloomPass.threshold = 0.6;

  missionPlanner.init(scene);
}

export function animate() {
  const ts = sim.timeScale;

  sun.rotation.y += 0.00005 * ts;

  planets.forEach((planet) => {
    planet.angle += planet.speed * 0.25 * ts;
    const x = planet.orbit * Math.cos(planet.angle);
    const y = planet.orbit * Math.sin(planet.angle) * Math.sin(planet.inclination);
    const zr = planet.orbit * Math.sin(planet.angle) * Math.cos(planet.inclination);
    planet.mesh.position.set(x, y, zr);
    planet.mesh.rotation.y += 0.001 * ts;
  });

  // Mars's moons — orbit relative to Mars's current position
  const marsP = planets.find((p) => p.name === 'Mars');
  if (marsP) {
    const mp = marsP.mesh.position;
    marsMoons.forEach((moon) => {
      moon.angle += moon.speed * 0.25 * ts;
      moon.mesh.position.set(
        mp.x + moon.orbit * Math.cos(moon.angle),
        mp.y,
        mp.z + moon.orbit * Math.sin(moon.angle)
      );
      moon.mesh.rotation.y += 0.001 * ts;
      moon.orbitLine.position.copy(mp);
    });
  }

  // Galilean moons — orbit relative to Jupiter's current position
  const jupiterP = planets.find((p) => p.name === 'Jupiter');
  if (jupiterP) {
    const jp = jupiterP.mesh.position;
    jupiterMoons.forEach((moon) => {
      moon.angle += moon.speed * 0.25 * ts;
      moon.mesh.position.set(
        jp.x + moon.orbit * Math.cos(moon.angle),
        jp.y,
        jp.z + moon.orbit * Math.sin(moon.angle)
      );
      moon.mesh.rotation.y += 0.001 * ts;
      moon.orbitLine.position.copy(jp);
    });
  }

  // Earth's Moon — orbit relative to Earth's current position
  const earthP = planets.find((p) => p.name === 'Earth');
  if (earthP) {
    const ep = earthP.mesh.position;
    earthMoons.forEach((moon) => {
      moon.angle += moon.speed * 0.25 * ts;
      moon.mesh.position.set(
        ep.x + moon.orbit * Math.cos(moon.angle),
        ep.y,
        ep.z + moon.orbit * Math.sin(moon.angle)
      );
      moon.mesh.rotation.y += 0.001 * ts;
      moon.orbitLine.position.copy(ep);
    });
  }

  // Saturn's moons — orbit relative to Saturn's current position
  const saturnP = planets.find((p) => p.name === 'Saturn');
  if (saturnP) {
    const sp = saturnP.mesh.position;
    saturnMoons.forEach((moon) => {
      moon.angle += moon.speed * 0.25 * ts;
      moon.mesh.position.set(
        sp.x + moon.orbit * Math.cos(moon.angle),
        sp.y,
        sp.z + moon.orbit * Math.sin(moon.angle)
      );
      moon.mesh.rotation.y += 0.001 * ts;
      moon.orbitLine.position.copy(sp);
    });
  }

  // Update mission planner (transfer arc, spacecraft, window tracking)
  if (missionPlanner) missionPlanner.update(planets, ts);

  // Flythrough takes exclusive camera control when active
  if (flythrough.isActive()) {
    flythrough.update(camera, controls, performance.now());
  } else if (focusTransition) {
    // Keep transition endpoints chasing the moving planet so there's no
    // stale-delta jump when steady tracking takes over after the animation.
    if (lockedMesh && lastLockedPos) {
      const newPos = lockedMesh.getWorldPosition(new THREE.Vector3());
      const delta = newPos.clone().sub(lastLockedPos);
      focusTransition.endCamPos.add(delta);
      focusTransition.endControlsTarget.add(delta);
      lastLockedPos = newPos.clone();
    }
    const elapsed = performance.now() - focusTransition.startTime;
    const t = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startControlsTarget, focusTransition.endControlsTarget, ease);
    camera.position.lerpVectors(focusTransition.startCamPos, focusTransition.endCamPos, ease);
    if (t >= 1) focusTransition = null;
  } else if (lockedMesh) {
    // Track the locked body — shift camera and target by how much the body moved
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
  if (mesh === sun) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCamPos = clickedPos.clone().add(dir.multiplyScalar(8));
  } else {
    const planetData = planets.find((p) => p.mesh === mesh);
    const moonData = jupiterMoons.find((m) => m.mesh === mesh) || earthMoons.find((m) => m.mesh === mesh) || marsMoons.find((m) => m.mesh === mesh) || saturnMoons.find((m) => m.mesh === mesh);
    const bodyData = planetData || moonData;
    const minDist = moonData ? 0.8 : 2.0;
    const dist = bodyData ? Math.max(minDist, bodyData.radius * 10) : 4;
    const toSunDir = clickedPos.clone().normalize().negate();
    endCamPos = clickedPos.clone().add(toSunDir.multiplyScalar(dist));
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  const pd = planets.find((p) => p.mesh === mesh);
  const md = jupiterMoons.find((m) => m.mesh === mesh) || earthMoons.find((m) => m.mesh === mesh) || marsMoons.find((m) => m.mesh === mesh) || saturnMoons.find((m) => m.mesh === mesh);
  const bodyRadius = mesh === sun ? 2.0 : (pd ? pd.radius : (md ? md.radius : 0.3));
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
  const objs = [{ name: 'Sun', mesh: sun }];
  planets.forEach((p) => objs.push({ name: p.name, mesh: p.mesh }));
  earthMoons.forEach((m) => objs.push({ name: m.name, mesh: m.mesh, parent: 'Earth' }));
  marsMoons.forEach((m) => objs.push({ name: m.name, mesh: m.mesh, parent: 'Mars' }));
  jupiterMoons.forEach((m) => objs.push({ name: m.name, mesh: m.mesh, parent: 'Jupiter' }));
  saturnMoons.forEach((m) => objs.push({ name: m.name, mesh: m.mesh, parent: 'Saturn' }));
  return objs;
}

// ── Flythrough ──
function buildSolarWaypoints() {
  const get = (name) => planets.find((p) => p.name === name);
  const getMoon = (arr, name) => arr.find((m) => m.name === name);

  // camDist = scene radius + thin margin so the camera skims the surface.
  // Rocky bodies: ~radius * 1.08 (≈100 miles above surface at real scale)
  // Gas giants:   ~radius * 1.04 (≈1000 miles above cloud tops)
  // Sun:          a bit more room so we don't clip the corona
  const wps = [
    { mesh: sun,                   name: 'Sun',       camDist: 2.6, weight: 1.5 },
    { mesh: get('Mercury').mesh,   name: 'Mercury',   camDist: 0.17, weight: 1.5 },  // r=0.15
    { mesh: get('Venus').mesh,     name: 'Venus',     camDist: 0.28, weight: 1.5 },  // r=0.25
    { mesh: get('Earth').mesh,     name: 'Earth',     camDist: 0.30, weight: 1.5 },  // r=0.27
  ];

  const moon = getMoon(earthMoons, 'Moon');
  if (moon) wps.push({ mesh: moon.mesh, name: 'Moon', camDist: 0.11, weight: 1.0 });  // r=0.09

  wps.push({ mesh: get('Mars').mesh, name: 'Mars', camDist: 0.20, weight: 1.5 });  // r=0.18

  const phobos = getMoon(marsMoons, 'Phobos');
  if (phobos) wps.push({ mesh: phobos.mesh, name: 'Phobos', camDist: 0.045, weight: 0.8 });  // r=0.028

  wps.push(
    { mesh: get('Jupiter').mesh, name: 'Jupiter', camDist: 0.73, weight: 1.0 },  // r=0.7
  );

  const io = getMoon(jupiterMoons, 'Io');
  const europa = getMoon(jupiterMoons, 'Europa');
  if (io) wps.push({ mesh: io.mesh, name: 'Io', camDist: 0.11, weight: 0.8 });       // r=0.09
  if (europa) wps.push({ mesh: europa.mesh, name: 'Europa', camDist: 0.09, weight: 0.8 }); // r=0.075

  wps.push(
    { mesh: get('Saturn').mesh, name: 'Saturn', camDist: 0.63, weight: 1.0 },  // r=0.6
  );

  const titan = getMoon(saturnMoons, 'Titan');
  if (titan) wps.push({ mesh: titan.mesh, name: 'Titan', camDist: 0.14, weight: 0.8 });  // r=0.12

  wps.push(
    { mesh: get('Uranus').mesh,  name: 'Uranus',  camDist: 0.42, weight: 1.0 },  // r=0.4
    { mesh: get('Neptune').mesh, name: 'Neptune', camDist: 0.40, weight: 1.0 },  // r=0.38
  );

  return wps;
}

export function startFlythrough(onComplete) {
  lockedMesh = null;
  lastLockedPos = null;
  focusTransition = null;
  const waypoints = buildSolarWaypoints();
  flythrough.start(waypoints, camera, controls, (name) => {
    if (cbFocus) cbFocus(name);
  }, onComplete);
}

export function cancelFlythrough() {
  flythrough.cancel(camera, controls);
}

export function isFlythroughActive() {
  return flythrough.isActive();
}

export function getMissionPlanner() { return missionPlanner; }
export function getPlanets() { return planets; }

/** Advance all orbital bodies by the given number of simulation frames (used by warp-to-window). */
export function advanceTime(frames) {
  planets.forEach(p => { p.angle += p.speed * 0.25 * frames; });
  jupiterMoons.forEach(m => { m.angle += m.speed * 0.25 * frames; });
  earthMoons.forEach(m => { m.angle += m.speed * 0.25 * frames; });
  marsMoons.forEach(m => { m.angle += m.speed * 0.25 * frames; });
  saturnMoons.forEach(m => { m.angle += m.speed * 0.25 * frames; });
}

export function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(window.innerWidth, window.innerHeight);
}

export function dispose() {
  if (flythrough.isActive()) flythrough.cancel(camera, controls);
  if (missionPlanner) missionPlanner.dispose();
  lockedMesh = null;
  lastLockedPos = null;
  jupiterMoons = [];
  earthMoons = [];
  marsMoons = [];
  saturnMoons = [];
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
