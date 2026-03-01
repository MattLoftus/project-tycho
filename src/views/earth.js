import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

let scene, camera, controls, renderer, camMove;
let earth, nightEarth, clouds, atmosphere, moon;
let moonOrbit, satellites;
let raycaster, mouse, clickableObjects;
let meshNameMap = new Map();
let focusTransition;
let lockedMesh = null;
let lastLockedPos = null;
let composer, cinematicPass;
const TRANSITION_DURATION = 2000;
const rotationSpeed = 0.000125;
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

  // Earth
  const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
  const earthMaterial = new THREE.MeshPhongMaterial({
    map: loader.load('/textures/earth_daymap.jpg'),
    bumpMap: loader.load('/textures/earth_normal.jpg'),
    bumpScale: 0.03,
    specularMap: loader.load('/textures/earth_specular.jpg'),
    specular: new THREE.Color(0x333333),
    shininess: 8,
  });
  earth = new THREE.Mesh(earthGeometry, earthMaterial);
  scene.add(earth);

  // Atmosphere glow — enhanced for cinematic look
  const atmosphereGeometry = new THREE.SphereGeometry(1.025, 64, 64);
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
        float atmosphere = pow(rim, 2.5) * 2.0;
        vec3 color = mix(vec3(0.2, 0.5, 1.0), vec3(0.5, 0.8, 1.0), rim);
        gl_FragColor = vec4(color, atmosphere * 0.7);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  scene.add(atmosphere);

  // Clouds
  const cloudGeometry = new THREE.SphereGeometry(1.01, 64, 64);
  const cloudMaterial = new THREE.MeshPhongMaterial({
    map: loader.load('/textures/earth_clouds.png'),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
  scene.add(clouds);

  // Night lights
  const nightMaterial = new THREE.MeshBasicMaterial({
    map: loader.load('/textures/earth_nightmap.jpg'),
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.8,
  });
  nightEarth = new THREE.Mesh(earthGeometry.clone(), nightMaterial);
  scene.add(nightEarth);

  // ── Starfield — equirectangular skybox ──
  const bgTex = loader.load('/textures/starfield.jpg');
  bgTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bgTex;

  // Lighting — dramatic key light
  const sunLight = new THREE.DirectionalLight(0xffeedd, 2.0);
  sunLight.position.set(5, 1, 3);
  scene.add(sunLight);
  const ambientLight = new THREE.AmbientLight(0x0a0a1a, 0.2);
  scene.add(ambientLight);
  // Subtle blue rim light from opposite side
  const rimLight = new THREE.DirectionalLight(0x4466aa, 0.4);
  rimLight.position.set(-3, -1, -2);
  scene.add(rimLight);

  // Moon
  const moonGeometry = new THREE.SphereGeometry(0.27, 32, 32);
  const moonMaterial = new THREE.MeshPhongMaterial({
    map: loader.load('/textures/moon.jpg'),
    shininess: 2,
  });
  moon = new THREE.Mesh(moonGeometry, moonMaterial);
  scene.add(moon);

  moonOrbit = { radius: 7, speed: 0.0003, inclination: 0.09, angle: 0 };

  // Orbital track helper — returns a circle in the XZ plane, tilted by inclination
  function makeOrbitLine(radius, inclination, color = 0x4488cc, opacity = 0.12) {
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

  // Moon orbital track
  scene.add(makeOrbitLine(moonOrbit.radius, moonOrbit.inclination, 0xaaccdd, 0.7));

  // Satellites
  satellites = [];
  const satelliteConfigs = [
    { radius: 1.4, speed: 0.002, inclination: 0.8, phase: 0 },
    { radius: 1.6, speed: 0.0015, inclination: 1.2, phase: 2.1 },
    { radius: 1.3, speed: 0.0025, inclination: 0.4, phase: 4.5 },
    { radius: 1.8, speed: 0.001, inclination: 1.5, phase: 1.0 },
    { radius: 1.5, speed: 0.0018, inclination: 0.1, phase: 3.3 },
  ];

  satelliteConfigs.forEach((cfg) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.015, 0.015),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 80, emissive: 0x111111 }),
    );
    group.add(body);
    const panelMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 60, side: THREE.DoubleSide });
    const leftPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.01), panelMat);
    leftPanel.position.x = -0.025;
    group.add(leftPanel);
    const rightPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.01), panelMat);
    rightPanel.position.x = 0.025;
    group.add(rightPanel);
    scene.add(group);
    scene.add(makeOrbitLine(cfg.radius, cfg.inclination, 0xaaccdd, 0.5));
    satellites.push({ group, ...cfg, angle: cfg.phase });
  });

  // Build mesh → name map
  meshNameMap = new Map();
  meshNameMap.set(earth, 'Earth');
  meshNameMap.set(moon, 'Moon');
  satellites.forEach((sat, i) => meshNameMap.set(sat.group.children[0], `SAT-0${i + 1}`));

  // Click-to-focus
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  clickableObjects = [earth, moon, ...satellites.map((s) => s.group.children[0])];
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
}

export function animate() {
  const ts = sim.timeScale;

  earth.rotation.y += rotationSpeed * ts;
  nightEarth.rotation.y += rotationSpeed * ts;
  clouds.rotation.y += rotationSpeed * 1.3 * ts;
  atmosphere.rotation.y += rotationSpeed * ts;

  moonOrbit.angle += moonOrbit.speed * 0.25 * ts;
  moon.position.set(
    moonOrbit.radius * Math.cos(moonOrbit.angle),
    moonOrbit.radius * Math.sin(moonOrbit.angle) * Math.sin(moonOrbit.inclination),
    moonOrbit.radius * Math.sin(moonOrbit.angle) * Math.cos(moonOrbit.inclination),
  );
  moon.rotation.y += 0.00005 * ts;

  satellites.forEach((sat) => {
    sat.angle += sat.speed * 0.25 * ts;
    const y = sat.radius * Math.sin(sat.angle) * Math.sin(sat.inclination);
    const xr = sat.radius * Math.cos(sat.angle);
    const zr = sat.radius * Math.sin(sat.angle) * Math.cos(sat.inclination);
    sat.group.position.set(xr, y, zr);
    const nextAngle = sat.angle + 0.01;
    const nx = sat.radius * Math.cos(nextAngle);
    const ny = sat.radius * Math.sin(nextAngle) * Math.sin(sat.inclination);
    const nz = sat.radius * Math.sin(nextAngle) * Math.cos(sat.inclination);
    sat.group.lookAt(nx, ny, nz);
  });

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

  // Update film grain time
  cinematicPass.uniforms.time.value = performance.now() * 0.001;

  camMove.update(0.016);
  controls.update();
  composer.render();
}

export function focusOn(mesh) {
  const clickedPos = mesh.getWorldPosition(new THREE.Vector3());
  let endCamPos;
  if (mesh === earth) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    endCamPos = clickedPos.clone().add(dir.multiplyScalar(3.5));
  } else {
    const toEarthDir = clickedPos.clone().normalize().negate();
    endCamPos = clickedPos.clone().add(toEarthDir.multiplyScalar(1.5));
  }
  lockedMesh = mesh;
  lastLockedPos = clickedPos.clone();
  const bodyRadius = mesh === earth ? 1.0 : 0.27;
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
  const objs = [
    { name: 'Earth', mesh: earth },
    { name: 'Moon', mesh: moon },
  ];
  satellites.forEach((sat, i) => objs.push({ name: `SAT-0${i + 1}`, mesh: sat.group.children[0] }));
  return objs;
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
