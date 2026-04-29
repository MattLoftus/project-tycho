import * as THREE from 'three'

/**
 * LIGO — Detecting Spacetime
 *
 * Visualizes how Earth-bound interferometers detect gravitational waves.
 * Scene elements:
 *   - Wireframe Earth (slowly rotating)
 *   - Two markers at H1 (Hanford, WA) and L1 (Livingston, LA) — the LIGO sites
 *   - A binary source far above Earth (two orbiting compact objects)
 *   - Periodic gravitational-wave wavefronts emitted by the source, expanding
 *     and washing over the planet
 *   - Each detector's marker pulses (and its L-arms strain) in sync with the
 *     instantaneous strain h(t) at its location, with the correct ~7-10 ms
 *     light-travel delay between H1 and L1
 *   - L-shaped 4-km arms at each site, exaggerated by ~10^10 so the strain
 *     is visible
 *
 * Physics tuning (parametric, not measured):
 *   - Inspiral frequency increases as f(t) ~ (t_c - t)^(-3/8) (post-Newtonian)
 *   - Amplitude grows as A(t) ~ (t_c - t)^(-1/4)
 *   - Merger at t = t_c, ringdown afterward at f_qnm ≈ 250 Hz, tau ≈ 4 ms
 *   - One full inspiral→merger→ringdown cycle compressed to ~6 simulated
 *     seconds for visualization (real GW150914 was ~0.2 s in band)
 */

const EARTH_RADIUS = 60
const STAR_COUNT = 2500
const STAR_RADIUS = 600

// LIGO site coordinates (lat in deg, lon in deg)
const H1_LAT = 46.4547
const H1_LON = -119.4077
const L1_LAT = 30.5629
const L1_LON = -90.7742
// Real arm orientation azimuth (Y-arm bearing from local north, deg) is
// 36° at H1 and 198° at L1; we honor this approximately for visual fidelity
const H1_ARM_AZIMUTH = 36 * Math.PI / 180
const L1_ARM_AZIMUTH = 198 * Math.PI / 180

const ARM_LENGTH = 18         // visible length (real 4 km, exaggerated)
const ARM_THICKNESS = 0.45

// Source binary — placed above and slightly behind Earth from default camera view
const SOURCE_POSITION = new THREE.Vector3(-90, 90, -30)
const SOURCE_DISTANCE = SOURCE_POSITION.length()

// Chirp parametric model — one cycle of inspiral→merger→ringdown takes
// CYCLE_DURATION simulated seconds, then resets.
const CYCLE_DURATION = 7.5
const INSPIRAL_END = 5.5      // merger at this fraction
const F_INITIAL = 0.6         // initial GW frequency (cycles per simulated sec)
const F_MERGER = 5.0
const A_INITIAL = 0.05
const A_MERGER = 1.0
const RINGDOWN_FREQ = 4.5
const RINGDOWN_TAU = 0.55

// GW wavefront propagation
const WAVEFRONT_SPEED = 65    // units per simulated second
const WAVEFRONT_BIRTH_INTERVAL = 1.8  // emit a wavefront every 1.8s for continuous visibility
const NUM_WAVEFRONTS = 6      // concentric rings live at once

// Light-travel delay tuning (for educational visibility — real H1-L1 is ~7-10 ms)
const ARRIVAL_DELAY_VISUAL_SEC = 0.18

// History buffer for HUD strain plot
const STRAIN_HISTORY_SAMPLES = 1024

// Convert lat/lon (deg) to a point on a sphere of given radius
function latLonToVec3(latDeg, lonDeg, radius) {
  const lat = latDeg * Math.PI / 180
  const lon = lonDeg * Math.PI / 180
  const x = radius * Math.cos(lat) * Math.cos(lon)
  const y = radius * Math.sin(lat)
  const z = -radius * Math.cos(lat) * Math.sin(lon)
  return new THREE.Vector3(x, y, z)
}

// Local east-north-up frame on Earth surface at given lat/lon
function localFrame(latDeg, lonDeg) {
  const up = latLonToVec3(latDeg, lonDeg, 1).normalize()
  const worldUp = new THREE.Vector3(0, 1, 0)
  const east = new THREE.Vector3().crossVectors(worldUp, up).normalize()
  const north = new THREE.Vector3().crossVectors(up, east).normalize()
  return { up, east, north }
}

function buildWireframeEarth() {
  const group = new THREE.Group()

  // Solid translucent inner sphere for occlusion
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 0.985, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x020610, transparent: true, opacity: 0.9 })
  )
  group.add(inner)

  // Wireframe outer (latitude/longitude grid effect)
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 36, 24),
    new THREE.MeshBasicMaterial({
      color: 0x40c0a0,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    })
  )
  group.add(wire)

  // Glow halo
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.05, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0x40c0a0,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    })
  )
  group.add(halo)

  return group
}

function buildDetector(latDeg, lonDeg, armAzimuth, accentColor) {
  const group = new THREE.Group()
  const pos = latLonToVec3(latDeg, lonDeg, EARTH_RADIUS * 1.005)
  const { up, east, north } = localFrame(latDeg, lonDeg)

  // Y-arm direction: rotate (north) by armAzimuth around (up)
  // X-arm = Y-arm rotated by 90° in the local plane
  const cosA = Math.cos(armAzimuth)
  const sinA = Math.sin(armAzimuth)
  const yArm = north.clone().multiplyScalar(cosA).add(east.clone().multiplyScalar(sinA))
  const xArm = north.clone().multiplyScalar(-sinA).add(east.clone().multiplyScalar(cosA))

  // Marker dot (always visible, glowing)
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 16, 16),
    new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.95 })
  )
  marker.position.copy(pos)
  group.add(marker)

  // Marker halo
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 20, 20),
    new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.18 })
  )
  halo.position.copy(pos)
  group.add(halo)

  // Build the L: two cylinders meeting at the corner (= marker pos)
  // We render arms a bit above the surface so they don't z-fight with the wireframe
  const armBase = pos.clone().addScaledVector(up, 0.05)

  function makeArm(direction, baseColor) {
    const armGroup = new THREE.Group()
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(ARM_THICKNESS, ARM_THICKNESS, ARM_LENGTH, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.92 })
    )
    // CylinderGeometry default axis is +Y; align it to `direction`
    const axis = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(axis, direction.clone().normalize())
    tube.quaternion.copy(q)
    // Place midpoint of cylinder at base + (length/2) * direction
    tube.position.copy(armBase).addScaledVector(direction, ARM_LENGTH / 2)
    armGroup.add(tube)

    // Tip cap — bright sphere at the far end of the arm; this is what the
    // viewer's eye latches onto when the arm "stretches"
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 12),
      new THREE.MeshBasicMaterial({ color: baseColor })
    )
    cap.position.copy(armBase).addScaledVector(direction, ARM_LENGTH)
    armGroup.add(cap)

    return { group: armGroup, tube, cap, direction: direction.clone(), baseColor }
  }

  const yArmObj = makeArm(yArm, accentColor)
  const xArmObj = makeArm(xArm, accentColor)
  group.add(yArmObj.group)
  group.add(xArmObj.group)

  return {
    group,
    marker,
    halo,
    yArm: yArmObj,
    xArm: xArmObj,
    basePosition: armBase.clone(),
    accent: accentColor,
    name: latDeg > 40 ? 'H1' : 'L1',
  }
}

function buildSourceBinary() {
  const group = new THREE.Group()
  group.position.copy(SOURCE_POSITION)

  const objMat = new THREE.MeshBasicMaterial({ color: 0x80c0ff })
  const objA = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 16), objMat)
  const objB = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 16), objMat)
  group.add(objA)
  group.add(objB)

  // Glow halo around the binary
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x80c0ff, transparent: true, opacity: 0.15, side: THREE.BackSide,
  })
  const halo = new THREE.Mesh(new THREE.SphereGeometry(8, 18, 18), haloMat)
  group.add(halo)

  // Wider faint halo for atmospheric glow
  const farHaloMat = new THREE.MeshBasicMaterial({
    color: 0x80c0ff, transparent: true, opacity: 0.04, side: THREE.BackSide,
  })
  const farHalo = new THREE.Mesh(new THREE.SphereGeometry(15, 18, 18), farHaloMat)
  group.add(farHalo)

  return { group, center: SOURCE_POSITION.clone(), objA, objB, halo, farHalo }
}

function buildStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = STAR_RADIUS * (0.95 + 0.05 * Math.random())
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi)
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xa0c8e0,
    size: 0.7,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  })
  return new THREE.Points(geo, mat)
}

function buildWavefronts() {
  const group = new THREE.Group()
  const fronts = []
  const mat = new THREE.MeshBasicMaterial({
    color: 0x80c0ff,
    transparent: true,
    opacity: 0.0,
    wireframe: true,
    side: THREE.DoubleSide,
  })
  for (let i = 0; i < NUM_WAVEFRONTS; i++) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 14),
      mat.clone(),
    )
    sphere.scale.setScalar(0.001)
    group.add(sphere)
    fronts.push({ mesh: sphere, birth: -1e9 })
  }
  return { group, fronts }
}

// ─── Chirp h(t) (parametric) ────────────────────────────────────────────────
//
// Returns the strain h at the source in dimensionless visual units (peak |h|=1
// near merger). cycleT is the simulated time within one cycle, in [0,
// CYCLE_DURATION).
function chirp(cycleT) {
  if (cycleT < 0 || cycleT >= CYCLE_DURATION) return 0
  if (cycleT <= INSPIRAL_END) {
    // Inspiral / merger — frequency and amplitude grow as we approach t_c
    const u = Math.max(0.05, INSPIRAL_END - cycleT)  // time before merger
    const fInst = Math.min(F_MERGER, F_INITIAL / Math.pow(u / INSPIRAL_END, 0.375))
    // Phase via integration of f(t):
    //   integral of (F_INITIAL / (u/T)^0.375) du over u from u0 to u
    // This is an approximation; for visualization we accept exact phase isn't
    // required — visual continuity matters more than analytic correctness
    const phase = 2 * Math.PI * fInst * cycleT
    const A = Math.min(A_MERGER, A_INITIAL * Math.pow(INSPIRAL_END / u, 0.25))
    return A * Math.cos(phase)
  } else {
    // Ringdown — damped oscillation
    const dt = cycleT - INSPIRAL_END
    return A_MERGER * Math.exp(-dt / RINGDOWN_TAU) * Math.cos(2 * Math.PI * RINGDOWN_FREQ * dt)
  }
}

export function createLigoModel() {
  const root = new THREE.Group()
  const earth = buildWireframeEarth()
  const starfield = buildStarfield()
  const source = buildSourceBinary()
  const h1 = buildDetector(H1_LAT, H1_LON, H1_ARM_AZIMUTH, 0x40e0c0)
  const l1 = buildDetector(L1_LAT, L1_LON, L1_ARM_AZIMUTH, 0xff90c0)
  const wavefrontPack = buildWavefronts()
  // Wavefronts originate at source position, so attach them to the source group
  source.group.add(wavefrontPack.group)

  root.add(earth)
  root.add(starfield)
  root.add(source.group)
  root.add(h1.group)
  root.add(l1.group)

  // Detector arrival delay along the wavefront direction
  // Time-of-flight: source center → detector position. We compute the flight
  // distance and divide by WAVEFRONT_SPEED. We exaggerate the difference
  // visually so it's perceptible (real ms-scale would be invisible).
  function arrivalTimeFor(detectorPos) {
    const distance = source.center.distanceTo(detectorPos)
    return distance / WAVEFRONT_SPEED
  }
  // Unit-of-delay is added to simulate visible retardation between H1 and L1.
  // We bias L1's arrival to lag H1's by ARRIVAL_DELAY_VISUAL_SEC for clarity.
  const h1ArrivalBase = arrivalTimeFor(h1.basePosition)
  const l1ArrivalBase = arrivalTimeFor(l1.basePosition) + ARRIVAL_DELAY_VISUAL_SEC

  // Strain history buffer for HUD plot (rolling). Pre-fill with one full
  // chirp cycle so the user sees the canonical inspiral→merger→ringdown
  // waveform as soon as the view opens (instead of an empty plot for
  // the first ~15 s while the rolling buffer fills).
  const strainHistory = new Float32Array(STRAIN_HISTORY_SAMPLES)
  for (let i = 0; i < STRAIN_HISTORY_SAMPLES; i++) {
    const t = (i / (STRAIN_HISTORY_SAMPLES - 1)) * CYCLE_DURATION
    strainHistory[i] = chirp(t)
  }
  let strainHistoryHead = 0
  let lastSimTime = 0

  // Track wavefront emission times
  let nextWavefrontIdx = 0

  function update(simTime) {
    const dt = Math.max(0, simTime - lastSimTime)
    lastSimTime = simTime

    // Earth rotates slowly
    earth.rotation.y = simTime * 0.05

    // Source binary orbit (just for visual life — orbits within the source group)
    const orbitRate = 1.5 + Math.min(4, simTime * 0.05)
    const orbitR = 4
    source.objA.position.set(orbitR * Math.cos(simTime * orbitRate), 0, orbitR * Math.sin(simTime * orbitRate))
    source.objB.position.set(-orbitR * Math.cos(simTime * orbitRate), 0, -orbitR * Math.sin(simTime * orbitRate))

    // ── Wavefront management ─────────────────────────────────────────
    // Birth a new wavefront every WAVEFRONT_BIRTH_INTERVAL seconds (so the
    // scene always has at least one front mid-flight, regardless of when
    // the screenshot is taken)
    const expectedBirths = Math.floor(simTime / WAVEFRONT_BIRTH_INTERVAL)
    while (
      wavefrontPack.fronts[nextWavefrontIdx].birth <
      expectedBirths * WAVEFRONT_BIRTH_INTERVAL
    ) {
      wavefrontPack.fronts[nextWavefrontIdx].birth =
        expectedBirths * WAVEFRONT_BIRTH_INTERVAL
      nextWavefrontIdx = (nextWavefrontIdx + 1) % NUM_WAVEFRONTS
    }
    // Update wavefront radii + opacity. We want each wavefront to be
    // crisp as it expands out from the source, then fade out by the time
    // its radius would engulf the camera (so we don't see "inside-the-sphere"
    // visual artifacts).
    const FADE_START = SOURCE_DISTANCE * 1.05    // ~just past Earth
    const FADE_END = SOURCE_DISTANCE * 1.65      // before reaching camera
    for (const front of wavefrontPack.fronts) {
      const age = simTime - front.birth
      if (age < 0) {
        front.mesh.material.opacity = 0
        continue
      }
      const radius = age * WAVEFRONT_SPEED
      front.mesh.scale.setScalar(Math.max(0.01, radius))
      const fade = radius < FADE_START
        ? 1.0
        : Math.max(0, 1 - (radius - FADE_START) / (FADE_END - FADE_START))
      front.mesh.material.opacity = 0.24 * fade
    }

    // ── Compute strain at each detector ──────────────────────────────
    const tH1 = simTime - h1ArrivalBase
    const tL1 = simTime - l1ArrivalBase
    const hH1 = chirp(((tH1 % CYCLE_DURATION) + CYCLE_DURATION) % CYCLE_DURATION)
    const hL1 = chirp(((tL1 % CYCLE_DURATION) + CYCLE_DURATION) % CYCLE_DURATION)

    // ── Apply strain to detector arms ────────────────────────────────
    // GW polarization causes one arm to stretch while the orthogonal arm
    // compresses (h+ pattern). Scale strain to a visible fraction of arm length.
    const STRAIN_VISUAL_SCALE = 0.18
    function applyStrain(detector, h) {
      const stretchY = 1 + h * STRAIN_VISUAL_SCALE
      const stretchX = 1 - h * STRAIN_VISUAL_SCALE
      // Cylinders are aligned along their `direction` (already oriented). To
      // stretch their effective length, scale the cylinder along its local Y
      // (the cylinder's intrinsic axis) and reposition the cap.
      detector.yArm.tube.scale.set(1, stretchY, 1)
      detector.xArm.tube.scale.set(1, stretchX, 1)
      detector.yArm.cap.position.copy(detector.basePosition)
        .addScaledVector(detector.yArm.direction, ARM_LENGTH * stretchY)
      detector.xArm.cap.position.copy(detector.basePosition)
        .addScaledVector(detector.xArm.direction, ARM_LENGTH * stretchX)
      // Marker pulses with |h|
      const pulse = 0.3 + 0.7 * Math.abs(h)
      detector.marker.scale.setScalar(0.85 + 0.6 * Math.abs(h))
      detector.halo.material.opacity = 0.1 + 0.6 * Math.abs(h)
      detector.marker.material.opacity = 0.6 + 0.4 * Math.abs(h)
      // Tube color brighten with strain
      const baseLum = 0.55 + 0.45 * Math.abs(h)
      detector.yArm.tube.material.opacity = baseLum
      detector.xArm.tube.material.opacity = baseLum
    }
    applyStrain(h1, hH1)
    applyStrain(l1, hL1)

    // ── Strain history (use the H1 trace) ────────────────────────────
    strainHistory[strainHistoryHead] = hH1
    strainHistoryHead = (strainHistoryHead + 1) % STRAIN_HISTORY_SAMPLES
  }

  // Phase label for the HUD
  function getPhase() {
    const cycleT = lastSimTime % CYCLE_DURATION
    if (cycleT < INSPIRAL_END * 0.6) return 'INSPIRAL'
    if (cycleT < INSPIRAL_END) return 'CHIRP'
    if (cycleT < INSPIRAL_END + RINGDOWN_TAU * 3) return 'MERGER'
    return 'RINGDOWN'
  }

  return {
    root,
    earth,
    starfield,
    source,
    h1,
    l1,
    wavefronts: wavefrontPack.group,
    update,
    getPhase,
    getStrainHistory() { return { buffer: strainHistory, head: strainHistoryHead } },
  }
}
