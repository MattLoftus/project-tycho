import * as THREE from 'three'

/**
 * Gravitational Wave Polarization — test particle ring.
 *
 * A ring of ~32 test particles lies in the plane perpendicular to the
 * direction of propagation. As a gravitational wave passes through, the
 * ring is rhythmically distorted:
 *
 *   + polarization ("plus"):  stretches along x, squeezes along y, then swaps
 *   × polarization ("cross"): same but rotated 45° (stretches along diagonals)
 *
 * Breaks the "waves are radial water ripples" misconception. Shows the
 * true transverse-traceless quadrupole nature of GW: no radial component,
 * two independent polarization modes 45° apart.
 *
 * View is set up with the wave propagating along +Z (away from viewer).
 * Particles live in the XY plane.
 */

const STAR_COUNT      = 2000
const STAR_RADIUS     = 120

// ─── Particle ring ──────────────────────────────────────────────────────────
const RING_RADIUS     = 6
const RING_COUNT      = 32
const PARTICLE_R      = 0.28

// ─── Wave parameters ────────────────────────────────────────────────────────
// Strain amplitude is exaggerated for visual impact (real GW strain is ~10⁻²¹)
const STRAIN_AMP      = 0.22
const WAVE_FREQ       = 0.7        // rad/s — one cycle ≈ 9s
const WAVE_SPEED      = 6          // propagation speed along +Z

// ─── Build the ring of test particles ───────────────────────────────────────

function buildRing() {
  const group = new THREE.Group()
  const particles = []

  const geo = new THREE.SphereGeometry(PARTICLE_R, 16, 12)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0e1830,
    roughness: 0.15,
    metalness: 0.85,
    emissive: 0x40a0ff,
    emissiveIntensity: 1.4,
  })

  for (let i = 0; i < RING_COUNT; i++) {
    const angle = (i / RING_COUNT) * Math.PI * 2
    const x0 = RING_RADIUS * Math.cos(angle)
    const y0 = RING_RADIUS * Math.sin(angle)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x0, y0, 0)
    group.add(mesh)

    particles.push({ mesh, x0, y0, angle })
  }

  return { group, mat, particles }
}

// ─── Reference outline — dashed unperturbed ring ────────────────────────────

function buildReferenceRing() {
  const segs = 96
  const points = []
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    points.push(new THREE.Vector3(RING_RADIUS * Math.cos(a), RING_RADIUS * Math.sin(a), 0))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const mat = new THREE.LineDashedMaterial({
    color: 0x5090ee,
    dashSize: 0.3,
    gapSize: 0.3,
    transparent: true,
    opacity: 0.25,
  })
  const line = new THREE.Line(geo, mat)
  line.computeLineDistances()
  return line
}

// ─── Wave-front visualization — moving "wave plane" behind the ring ─────────

function buildWaveFront() {
  // A disc of glowing points moving along +Z; the particles react as it
  // reaches z = 0. This makes the wave's direction of propagation tangible.
  const count = 400
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const radii = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * (RING_RADIUS * 1.8)
    positions[i * 3]     = r * Math.cos(a)
    positions[i * 3 + 1] = r * Math.sin(a)
    positions[i * 3 + 2] = 0
    radii[i] = r
    const fade = 1 - r / (RING_RADIUS * 1.8)
    colors[i * 3]     = 0.25 * fade
    colors[i * 3 + 1] = 0.55 * fade
    colors[i * 3 + 2] = 1.0 * fade
  }
  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  return { points: new THREE.Points(geo, mat), posAttr, radii, count }
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
    size: 0.5, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true,
  }))
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function createPolarizationModel() {
  const ring = buildRing()
  const refRing = buildReferenceRing()
  const wave = buildWaveFront()
  const starfield = buildStarfield()

  return {
    ring: ring.group,
    refRing,
    wave: wave.points,
    starfield,
    mode: 'plus',        // 'plus' | 'cross' | 'both'

    update(time) {
      // Strain amplitude h(t): sinusoidal at the ring's location (z=0)
      const phase = time * WAVE_FREQ
      // h+ and h× with 90° phase offset; for the pure "plus" mode, only h+
      // For pure "cross" mode, only h× at the same frequency
      // For "both", they combine to produce a circular polarization
      let hPlus = 0
      let hCross = 0
      if (this.mode === 'plus') {
        hPlus = STRAIN_AMP * Math.cos(phase)
      } else if (this.mode === 'cross') {
        hCross = STRAIN_AMP * Math.cos(phase)
      } else {
        // Both modes 90° out of phase → circular polarization
        hPlus  = STRAIN_AMP * Math.cos(phase)
        hCross = STRAIN_AMP * Math.sin(phase)
      }

      // Apply transverse-traceless strain to each particle position.
      // Linearized GW metric: δx = (1/2) h+ x + (1/2) h× y
      //                      δy = (1/2) h× x - (1/2) h+ y
      // (These are the TT-gauge displacements for a wave along z.)
      for (const p of ring.particles) {
        const dx = 0.5 * (hPlus * p.x0 + hCross * p.y0)
        const dy = 0.5 * (hCross * p.x0 - hPlus * p.y0)
        p.mesh.position.x = p.x0 + dx
        p.mesh.position.y = p.y0 + dy
      }

      // Wave-front points drift along +Z, wrap around
      const wavePeriod = 24
      const waveZ = ((time * WAVE_SPEED) % wavePeriod) - wavePeriod / 2
      const parr = wave.posAttr.array
      for (let i = 0; i < wave.count; i++) {
        parr[i * 3 + 2] = waveZ
      }
      wave.posAttr.needsUpdate = true

      // Slow starfield drift
      starfield.rotation.y = time * 0.003
    },
  }
}
