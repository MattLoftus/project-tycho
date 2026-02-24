import * as THREE from 'three';

/**
 * Mission Planner — Hohmann Transfer Calculator & Visualizer.
 *
 * Computes optimal Hohmann transfer orbits between planets, tracks launch
 * windows in real time, and animates a spacecraft along the transfer ellipse
 * with proper Keplerian motion.
 */

// Planet orbital data (must match PLANET_DATA in solar.js)
const PLANETS = [
  { name: 'Mercury', orbit: 6,  speed: 0.0012, inclination: 0.12 },
  { name: 'Venus',   orbit: 9,  speed: 0.0009, inclination: 0.06 },
  { name: 'Earth',   orbit: 12, speed: 0.0007, inclination: 0.0  },
  { name: 'Mars',    orbit: 16, speed: 0.0005, inclination: 0.03 },
  { name: 'Jupiter', orbit: 24, speed: 0.00025, inclination: 0.02 },
  { name: 'Saturn',  orbit: 34, speed: 0.00015, inclination: 0.04 },
  { name: 'Uranus',  orbit: 44, speed: 0.0001, inclination: 0.01 },
  { name: 'Neptune', orbit: 54, speed: 0.00007, inclination: 0.03 },
];

// Earth reference for unit conversion
const EARTH = PLANETS.find(p => p.name === 'Earth');
const EARTH_OMEGA = EARTH.speed * 0.25;
const EARTH_V_SCENE = EARTH_OMEGA * EARTH.orbit;
const EARTH_V_KMS = 29.78; // km/s
const V_SCALE = EARTH_V_KMS / EARTH_V_SCENE; // scene units/frame → km/s

const EARTH_PERIOD_FRAMES = 2 * Math.PI / EARTH_OMEGA;
const FRAMES_TO_DAYS = 365.25 / EARTH_PERIOD_FRAMES;

const WINDOW_THRESHOLD = 0.05; // radians (~2.9°)
const TRAIL_LENGTH = 80;

function omega(planet) { return planet.speed * 0.25; }
function mu(planet) { const w = omega(planet); return planet.orbit ** 3 * w * w; }

/** Solve Kepler's equation M = E - e*sin(E) via Newton-Raphson */
function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Normalize angle to [0, 2π) */
function norm(a) { return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); }

/** Format days into human-readable string */
function formatDays(days) {
  if (days < 1) return `${(days * 24).toFixed(1)} hrs`;
  if (days < 365) return `${days.toFixed(0)} days`;
  const yrs = days / 365.25;
  return yrs < 10 ? `${yrs.toFixed(1)} yrs` : `${yrs.toFixed(0)} yrs`;
}

/**
 * Compute Hohmann transfer parameters between two planets.
 * @param {string} originName
 * @param {string} destName
 * @param {number} originAngle - current orbital angle of origin planet
 * @param {number} destAngle   - current orbital angle of dest planet
 */
export function computeTransfer(originName, destName, originAngle, destAngle) {
  const origin = PLANETS.find(p => p.name === originName);
  const dest   = PLANETS.find(p => p.name === destName);
  if (!origin || !dest || origin === dest) return null;

  const r1 = origin.orbit;
  const r2 = dest.orbit;
  const w1 = omega(origin);
  const w2 = omega(dest);

  // Transfer ellipse
  const a = (r1 + r2) / 2;
  const b = Math.sqrt(r1 * r2);
  const c = Math.abs(r2 - r1) / 2;
  const e = c / a;

  // Gravitational parameter (average of both planets' implied μ)
  const muAvg = (mu(origin) + mu(dest)) / 2;

  // Transfer time in frames (half period of transfer orbit)
  const T = Math.PI * Math.sqrt(a * a * a / muAvg);

  // Required phase angle at departure
  const thetaDestTravel = w2 * T;
  // For outward transfer (r2 > r1): dest must be ahead by π - θ
  // For inward transfer (r2 < r1): departure is at apoapsis
  const outward = r2 > r1;
  const phiRequired = outward
    ? norm(Math.PI - thetaDestTravel)
    : norm(Math.PI + thetaDestTravel); // inward: arrives at periapsis

  // Current phase angle
  const phiCurrent = norm(destAngle - originAngle);

  // Synodic period & window timing
  // phi = destAngle - originAngle changes at rate (w2 - w1).
  // For outward transfers (w1 > w2): phi decreases → gap in decreasing direction
  // For inward transfers (w1 < w2): phi increases → gap in increasing direction
  const wSynodic = Math.abs(w1 - w2);
  const deltaPhi = w1 > w2
    ? norm(phiCurrent - phiRequired)   // phi decreasing
    : norm(phiRequired - phiCurrent);  // phi increasing
  const framesToWindow = wSynodic > 0 ? deltaPhi / wSynodic : Infinity;

  // Delta-V via vis-viva
  const vCirc1 = w1 * r1;
  const vCirc2 = w2 * r2;
  const vTransDep = Math.sqrt(Math.abs(muAvg * (2 / r1 - 1 / a)));
  const vTransArr = Math.sqrt(Math.abs(muAvg * (2 / r2 - 1 / a)));
  const dvDep = Math.abs(vTransDep - vCirc1);
  const dvArr = Math.abs(vCirc2 - vTransArr);

  return {
    origin, dest,
    r1, r2, a, b, c, e, outward,
    T,                                    // frames
    transferDays: T * FRAMES_TO_DAYS,
    phiRequired, phiCurrent,
    framesToWindow,
    windowDays: framesToWindow * FRAMES_TO_DAYS,
    dvDep: dvDep * V_SCALE,              // km/s
    dvArr: dvArr * V_SCALE,
    dvTotal: (dvDep + dvArr) * V_SCALE,
    w1, w2,
    originInclination: origin.inclination,
    destInclination: dest.inclination,
  };
}

/**
 * Update launch window status given current planet angles.
 */
export function updateWindow(transfer, originAngle, destAngle) {
  const phiCurrent = norm(destAngle - originAngle);
  let delta = Math.abs(phiCurrent - transfer.phiRequired);
  if (delta > Math.PI) delta = 2 * Math.PI - delta;

  const isOpen = delta < WINDOW_THRESHOLD;
  const progress = Math.max(0, 1 - delta / Math.PI);

  const wSynodic = Math.abs(transfer.w1 - transfer.w2);
  const gap = transfer.w1 > transfer.w2
    ? norm(phiCurrent - transfer.phiRequired)
    : norm(transfer.phiRequired - phiCurrent);
  const framesToWindow = wSynodic > 0 ? gap / wSynodic : Infinity;
  const daysToWindow = framesToWindow * FRAMES_TO_DAYS;

  return { isOpen, progress, daysToWindow, delta, phiCurrent };
}

/**
 * Get spacecraft position on transfer ellipse at time fraction t ∈ [0,1].
 * Uses Kepler's equation for realistic non-uniform speed.
 */
function getTransferPos(t, transfer, departAngle) {
  const { a, b, c, e, r1, r2, outward, originInclination, destInclination } = transfer;
  const avgIncl = (originInclination + destInclination) / 2;

  // Mean anomaly: 0 → π over the half-orbit transfer
  const M = t * Math.PI;
  const E = solveKepler(M, e);

  // Position in Sun-centered local frame (major axis along departure direction)
  let localX, localY;
  if (outward) {
    // Periapsis at r1 (departure), apoapsis at r2 (arrival)
    localX = a * Math.cos(E) - c; // at E=0: a-c = r1; at E=π: -a-c = -r2
    localY = b * Math.sin(E);
  } else {
    // Inward: periapsis at r2 (arrival), apoapsis at r1 (departure)
    // Spacecraft starts at apoapsis (E=π) and arrives at periapsis (E=2π=0)
    // Remap: E goes from π to 2π
    const Einward = Math.PI + E; // E from solveKepler goes 0→π, so this goes π→2π
    localX = a * Math.cos(Einward) - c;
    localY = b * Math.sin(Einward);
    // Flip c direction: for inward, focus offset is reversed
    // Actually let's reconsider: for inward transfer with r1 > r2:
    // c = (r1 - r2) / 2, a = (r1 + r2) / 2
    // periapsis = a - c = r2, apoapsis = a + c = r1
    // Sun at focus: at (c, 0) from center (standard convention)
    // Shift: localX = a*cos(E) - c puts Sun at origin... but periapsis at a-c, apoapsis at -(a+c)
    // For inward: start at apoapsis localX = -(a+c) = -r1
    // We want departure at angle departAngle to be at distance r1
    // So let's just negate localX to flip
    localX = -(a * Math.cos(E) - c);
    localY = b * Math.sin(E);
  }

  // Rotate to world coordinates by departure angle
  const x = localX * Math.cos(departAngle) - localY * Math.sin(departAngle);
  const rawZ = localX * Math.sin(departAngle) + localY * Math.cos(departAngle);
  const y = rawZ * Math.sin(avgIncl);
  const z = rawZ * Math.cos(avgIncl);

  return new THREE.Vector3(x, y, z);
}

// ─────────────────────────────────────────────
// Three.js visual objects + state machine
// ─────────────────────────────────────────────

export function createMissionPlanner() {
  let scene;

  // Visual objects
  let arcLine = null;       // planned dashed arc
  let glowTube = null;      // active glowing arc
  let spacecraft = null;    // animated dot
  let trailLine = null;     // fading trail
  let windowArc = null;     // launch window indicator on origin orbit

  // State
  const state = {
    phase: 'idle', // idle | computed | inTransit | arrived
    transfer: null,
    departAngle: 0,
    elapsedFrames: 0,
    totalFrames: 0,
    trailPositions: [],
    arrivedTimer: 0,
  };

  function init(sceneRef) {
    scene = sceneRef;

    // Spacecraft visual
    spacecraft = new THREE.Group();
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x88ffcc }),
    );
    spacecraft.add(dot);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.25 }),
    );
    spacecraft.add(glow);
    spacecraft.visible = false;
    scene.add(spacecraft);

    // Trail line (pre-allocated buffer)
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
    trailGeo.setDrawRange(0, 0);
    trailLine = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.4 }),
    );
    trailLine.visible = false;
    scene.add(trailLine);
  }

  /** Build the half-ellipse arc points for a given transfer + departure angle */
  function buildArcPoints(transfer, departAngle) {
    const pts = [];
    const N = 128;
    for (let i = 0; i <= N; i++) {
      pts.push(getTransferPos(i / N, transfer, departAngle));
    }
    return pts;
  }

  /** Show the planned transfer arc (dashed line) */
  function showPlannedArc(transfer, departAngle) {
    removePlannedArc();
    removeGlowTube();

    const pts = buildArcPoints(transfer, departAngle);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    arcLine = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({
        color: 0x44ffaa,
        dashSize: 0.6,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.7,
      }),
    );
    arcLine.computeLineDistances();
    scene.add(arcLine);
  }

  /** Show the active glowing tube for in-flight */
  function showGlowTube(transfer, departAngle) {
    removePlannedArc();
    removeGlowTube();

    const pts = buildArcPoints(transfer, departAngle);
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 128, 0.05, 8, false);
    glowTube = new THREE.Mesh(
      tubeGeo,
      new THREE.MeshBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.5 }),
    );
    scene.add(glowTube);
  }

  /** Show launch window arc on origin orbit */
  function showWindowArc(transfer, originAngle) {
    removeWindowArc();
    const { r1, phiRequired, originInclination } = transfer;

    // The ideal departure angle for the origin planet
    const idealOriginAngle = originAngle; // current origin position
    // The window angle on the orbit where the phase is correct
    // Actually: the window arc should show WHERE on the origin orbit to launch from
    // This depends on the destination's current angle + required phase
    // For visualization, draw a small bright arc segment on the origin orbit
    const pts = [];
    const arcSpan = WINDOW_THRESHOLD * 3; // widen for visibility
    const N = 32;
    for (let i = 0; i <= N; i++) {
      const t = -arcSpan + (2 * arcSpan) * (i / N);
      const a = originAngle + t;
      const x = r1 * Math.cos(a);
      const y = r1 * Math.sin(a) * Math.sin(originInclination);
      const z = r1 * Math.sin(a) * Math.cos(originInclination);
      pts.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    windowArc = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.8, linewidth: 2 }),
    );
    scene.add(windowArc);
  }

  function removePlannedArc() {
    if (arcLine) { scene.remove(arcLine); arcLine.geometry.dispose(); arcLine = null; }
  }
  function removeGlowTube() {
    if (glowTube) { scene.remove(glowTube); glowTube.geometry.dispose(); glowTube = null; }
  }
  function removeWindowArc() {
    if (windowArc) { scene.remove(windowArc); windowArc.geometry.dispose(); windowArc = null; }
  }

  /**
   * Compute transfer and show the planned arc.
   * Returns the transfer data for UI display.
   */
  function compute(originName, destName, planets) {
    const originP = planets.find(p => p.name === originName);
    const destP   = planets.find(p => p.name === destName);
    if (!originP || !destP) return null;

    const transfer = computeTransfer(originName, destName, originP.angle, destP.angle);
    if (!transfer) return null;

    state.transfer = transfer;
    state.phase = 'computed';
    state.departAngle = originP.angle;

    // Show planned arc from current origin position
    showPlannedArc(transfer, originP.angle);

    return transfer;
  }

  /**
   * Launch the spacecraft. Must be called when window is open.
   */
  function launch(planets) {
    if (state.phase !== 'computed' || !state.transfer) return;

    const originP = planets.find(p => p.name === state.transfer.origin.name);
    if (!originP) return;

    state.departAngle = originP.angle;
    state.elapsedFrames = 0;
    state.totalFrames = state.transfer.T;
    state.trailPositions = [];
    state.phase = 'inTransit';

    // Switch to glowing tube
    showGlowTube(state.transfer, state.departAngle);
    removeWindowArc();

    // Show spacecraft
    spacecraft.visible = true;
    trailLine.visible = true;
    const startPos = getTransferPos(0, state.transfer, state.departAngle);
    spacecraft.position.copy(startPos);
  }

  /**
   * Called every frame from solar.js animate().
   * @param {Array} planets - live planet objects with .angle property
   * @param {number} ts - timeScale
   * @returns {{ phase, windowStatus }} current state for UI updates
   */
  function update(planets, ts) {
    if (state.phase === 'idle') return { phase: 'idle' };

    const transfer = state.transfer;

    if (state.phase === 'computed') {
      // Update planned arc position (origin planet is moving)
      const originP = planets.find(p => p.name === transfer.origin.name);
      const destP   = planets.find(p => p.name === transfer.dest.name);
      if (originP && destP) {
        // Recompute arc from current origin position
        state.departAngle = originP.angle;
        showPlannedArc(transfer, originP.angle);

        // Update window status
        const ws = updateWindow(transfer, originP.angle, destP.angle);
        showWindowArc(transfer, originP.angle);
        return { phase: 'computed', windowStatus: ws };
      }
      return { phase: 'computed' };
    }

    if (state.phase === 'inTransit') {
      state.elapsedFrames += ts;
      const frac = Math.min(state.elapsedFrames / state.totalFrames, 1);

      // Spacecraft position via Kepler
      const pos = getTransferPos(frac, transfer, state.departAngle);
      spacecraft.position.copy(pos);

      // Trail
      state.trailPositions.push(pos.clone());
      if (state.trailPositions.length > TRAIL_LENGTH) state.trailPositions.shift();
      const posArr = trailLine.geometry.attributes.position.array;
      for (let i = 0; i < state.trailPositions.length; i++) {
        posArr[i * 3]     = state.trailPositions[i].x;
        posArr[i * 3 + 1] = state.trailPositions[i].y;
        posArr[i * 3 + 2] = state.trailPositions[i].z;
      }
      trailLine.geometry.attributes.position.needsUpdate = true;
      trailLine.geometry.setDrawRange(0, state.trailPositions.length);

      if (frac >= 1) {
        state.phase = 'arrived';
        state.arrivedTimer = 120; // frames (~2s at 60fps)
        return { phase: 'arrived' };
      }

      return { phase: 'inTransit', progress: frac };
    }

    if (state.phase === 'arrived') {
      state.arrivedTimer -= 1;
      // Pulse the spacecraft glow
      const pulse = 0.5 + 0.5 * Math.sin(state.arrivedTimer * 0.3);
      spacecraft.children[1].material.opacity = 0.15 + 0.35 * pulse;

      if (state.arrivedTimer <= 0) {
        cancel();
        return { phase: 'idle' };
      }
      return { phase: 'arrived' };
    }

    return { phase: state.phase };
  }

  /** Cancel / reset everything */
  function cancel() {
    state.phase = 'idle';
    state.transfer = null;
    state.trailPositions = [];
    spacecraft.visible = false;
    trailLine.visible = false;
    trailLine.geometry.setDrawRange(0, 0);
    removePlannedArc();
    removeGlowTube();
    removeWindowArc();
  }

  function dispose() {
    cancel();
    if (spacecraft) { scene.remove(spacecraft); spacecraft = null; }
    if (trailLine) { scene.remove(trailLine); trailLine.geometry.dispose(); trailLine = null; }
  }

  function getPhase() { return state.phase; }
  function getTransferData() { return state.transfer; }

  return {
    init,
    compute,
    launch,
    update,
    cancel,
    dispose,
    getPhase,
    getTransferData,
    // Expose utilities for UI
    formatDays,
    PLANETS,
  };
}
