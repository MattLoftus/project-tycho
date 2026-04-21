import * as THREE from 'three'

/**
 * Gravitational Redshift — time-dilation made visual.
 *
 * Two analog clocks sit at different depths in a gravitational well. The
 * bottom clock (closer to the mass) runs slower than the top clock. Light
 * from the bottom clock, climbing out of the well, is redshifted — lower
 * frequency when it reaches the top observer.
 *
 * This view deliberately breaks the rubber-sheet metaphor. Instead of a
 * 2D grid of space curvature, we show TIME running at different rates
 * in the two clocks. Beam of light traveling upward gets redshifted along
 * the way, shown as color-shift particles.
 */

const STAR_COUNT      = 1500
const STAR_RADIUS     = 120

// Mass producing the gravity well — positioned below the lower clock
const MASS_POS_Y      = -12
const MASS_RADIUS     = 3
const MASS_STRENGTH   = 0.4     // Schwarzschild factor: g_tt ≈ 1 - 2GM/rc²,
                                // so time dilation factor = sqrt(1 - MASS_STRENGTH/r)

// Clock positions (Y = height above the mass center)
const CLOCK_BOTTOM_Y  = -5
const CLOCK_TOP_Y     = 8

// Clock design
const CLOCK_R         = 2.0
const HAND_LENGTH     = 1.6

// Time-dilation factor at a given height Y (distance from mass)
function timeDilation(y) {
  const r = y - MASS_POS_Y  // distance from mass center
  // Schwarzschild: dτ/dt = sqrt(1 - 2GM/rc²)
  const factor = Math.sqrt(Math.max(0.01, 1 - MASS_STRENGTH / Math.max(r, 1.5)))
  return factor
}

// ─── Clock builder ──────────────────────────────────────────────────────────

function buildClock(labelColor) {
  const group = new THREE.Group()

  // Clock face — flat disc
  const faceGeo = new THREE.CircleGeometry(CLOCK_R, 64)
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x101828,
    roughness: 0.3,
    metalness: 0.6,
    emissive: 0x0a0e18,
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
  })
  const face = new THREE.Mesh(faceGeo, faceMat)
  group.add(face)

  // Outer ring
  const ringGeo = new THREE.TorusGeometry(CLOCK_R, 0.08, 12, 64)
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c18,
    roughness: 0.15,
    metalness: 0.9,
    emissive: labelColor,
    emissiveIntensity: 0.8,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  group.add(ring)

  // Hour markers — 12 small dashes around the rim
  const markerMat = new THREE.MeshBasicMaterial({
    color: labelColor,
    transparent: true,
    opacity: 0.9,
  })
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
    const inner = CLOCK_R * 0.85
    const outer = CLOCK_R * 0.95
    const len = i % 3 === 0 ? (outer - inner) * 1.6 : (outer - inner)
    const w = i % 3 === 0 ? 0.1 : 0.06
    const markGeo = new THREE.PlaneGeometry(w, len)
    const mark = new THREE.Mesh(markGeo, markerMat)
    mark.position.set(Math.cos(angle) * (inner + len / 2), Math.sin(angle) * (inner + len / 2), 0.02)
    mark.rotation.z = angle + Math.PI / 2
    group.add(mark)
  }

  // Minute hand
  const minuteGeo = new THREE.PlaneGeometry(0.05, HAND_LENGTH)
  const minuteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 })
  const minuteHand = new THREE.Mesh(minuteGeo, minuteMat)
  minuteHand.position.y = HAND_LENGTH / 2
  minuteHand.position.z = 0.04
  const minuteGroup = new THREE.Group()
  minuteGroup.add(minuteHand)
  group.add(minuteGroup)

  // Second hand — thinner, emissive color
  const secondGeo = new THREE.PlaneGeometry(0.03, HAND_LENGTH * 1.1)
  const secondMat = new THREE.MeshBasicMaterial({ color: labelColor, transparent: true, opacity: 0.95 })
  const secondHand = new THREE.Mesh(secondGeo, secondMat)
  secondHand.position.y = (HAND_LENGTH * 1.1) / 2
  secondHand.position.z = 0.05
  const secondGroup = new THREE.Group()
  secondGroup.add(secondHand)
  group.add(secondGroup)

  // Center pivot
  const pivotGeo = new THREE.CircleGeometry(0.12, 16)
  const pivotMat = new THREE.MeshBasicMaterial({ color: labelColor })
  const pivot = new THREE.Mesh(pivotGeo, pivotMat)
  pivot.position.z = 0.06
  group.add(pivot)

  return { group, minuteGroup, secondGroup, ringMat }
}

// ─── Mass sphere ────────────────────────────────────────────────────────────

function buildMass() {
  const geo = new THREE.SphereGeometry(MASS_RADIUS, 48, 32)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0a12,
    roughness: 0.05,
    metalness: 0.98,
    emissive: 0x1a2040,
    emissiveIntensity: 0.6,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(0, MASS_POS_Y, 0)
  return { mesh, mat }
}

// ─── Photon beam — travels bottom → top, redshifts as it climbs ─────────────

const BEAM_COUNT = 80

function buildPhotonBeam() {
  const positions = new Float32Array(BEAM_COUNT * 3)
  const colors = new Float32Array(BEAM_COUNT * 3)
  // Each photon has a phase offset along the path so they appear as a stream
  const phases = new Float32Array(BEAM_COUNT)
  for (let i = 0; i < BEAM_COUNT; i++) {
    phases[i] = i / BEAM_COUNT
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  const colAttr = new THREE.BufferAttribute(colors, 3)
  colAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color', colAttr)

  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.35,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  return { points, posAttr, colAttr, phases }
}

function updatePhotonBeam(beam, time) {
  const parr = beam.posAttr.array
  const carr = beam.colAttr.array
  const span = CLOCK_TOP_Y - CLOCK_BOTTOM_Y
  const speed = 0.08  // how fast photons climb (fraction of span per second)
  for (let i = 0; i < BEAM_COUNT; i++) {
    const phase = (beam.phases[i] + time * speed) % 1
    const y = CLOCK_BOTTOM_Y + phase * span
    // Slight horizontal drift to make the beam feel like a stream, not a line
    parr[i * 3]     = Math.sin(time * 0.5 + i) * 0.08
    parr[i * 3 + 1] = y
    parr[i * 3 + 2] = 0

    // Color: starts blue (high-frequency, deep in well) → ends red (low-freq, up high)
    // Actually gravitational redshift: photons LOSE energy climbing out → become redder
    const t = phase  // 0 at bottom, 1 at top
    // At bottom (t=0): blue-white; at top (t=1): red
    const r = 0.5 + 0.5 * t
    const g = 0.5 - 0.3 * t
    const b = 1.0 - 0.9 * t
    carr[i * 3]     = r
    carr[i * 3 + 1] = g
    carr[i * 3 + 2] = b
  }
  beam.posAttr.needsUpdate = true
  beam.colAttr.needsUpdate = true
}

// ─── Starfield ──────────────────────────────────────────────────────────────

function buildStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = STAR_RADIUS * (0.7 + Math.random() * 0.3)
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    const warmth = Math.random()
    if (warmth > 0.85) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 0.65
    } else if (warmth > 0.6) {
      colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.82; colors[i * 3 + 2] = 1.0
    } else {
      colors[i * 3] = 0.88; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.94
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.4, vertexColors: true, transparent: true, opacity: 0.6, sizeAttenuation: true,
  }))
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function createRedshiftModel() {
  const mass = buildMass()

  // Two clocks: bottom (orange, redshifted) and top (cyan, reference)
  const topClock = buildClock(0x4da8ff)
  const bottomClock = buildClock(0xff8040)

  topClock.group.position.set(0, CLOCK_TOP_Y, 0)
  bottomClock.group.position.set(0, CLOCK_BOTTOM_Y, 0)

  const beam = buildPhotonBeam()
  const starfield = buildStarfield()

  // Time-dilation factors (precomputed)
  const topFactor = timeDilation(CLOCK_TOP_Y)
  const bottomFactor = timeDilation(CLOCK_BOTTOM_Y)
  const relativeRatio = bottomFactor / topFactor   // how much slower bottom runs

  return {
    mass: mass.mesh,
    topClock: topClock.group,
    bottomClock: bottomClock.group,
    beam: beam.points,
    starfield,
    // Exposed state
    topFactor,
    bottomFactor,
    relativeRatio,

    update(time) {
      // Clock hands — each running at its own rate
      // "Seconds" per real second: factor × 1 rad/s (so a full rev every ~2π seconds, scaled)
      const secRate = 1.5  // visual tuning: 1 revolution per ~4 real seconds at top
      topClock.secondGroup.rotation.z = -time * secRate * topFactor
      bottomClock.secondGroup.rotation.z = -time * secRate * bottomFactor

      // Minute hands — 60× slower
      topClock.minuteGroup.rotation.z = -time * secRate * topFactor / 60
      bottomClock.minuteGroup.rotation.z = -time * secRate * bottomFactor / 60

      // Rings pulse subtly
      topClock.ringMat.emissiveIntensity = 0.7 + Math.sin(time * topFactor * 1.8) * 0.2
      bottomClock.ringMat.emissiveIntensity = 0.7 + Math.sin(time * bottomFactor * 1.8) * 0.2

      // Mass glow pulses
      mass.mat.emissiveIntensity = 0.5 + Math.sin(time * 0.6) * 0.15

      // Photon beam
      updatePhotonBeam(beam, time)

      // Starfield slow drift
      starfield.rotation.y = time * 0.002
    },
  }
}
