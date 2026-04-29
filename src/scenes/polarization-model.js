import * as THREE from 'three'

/**
 * Gravitational Wave Polarization — v2.
 *
 * Pedagogical payload: a gravitational wave is not a ripple on a pond —
 * it is a transverse-traceless (TT) strain that stretches one axis while
 * squeezing the perpendicular axis, oscillating between the two. It has
 * two independent polarization modes — "plus" (+) and "cross" (×) — 45°
 * apart; their linear combination is a general GW.
 *
 * Scene composition:
 *
 *   • A binary source sits in the XY plane at the origin, orbiting at the
 *     GW half-frequency.  It is the physical origin of the wave.
 *
 *   • A row of test-particle rings extends along +Z, perpendicular to the
 *     orbital plane (the direction of maximum GW emission).  As the wave
 *     propagates up +Z it reaches each ring at a different retarded time,
 *     so the rings oscillate out of phase.
 *
 *   • Each ring particle carries a short "displacement vector" drawn from
 *     its rest position to its current position — the strain field made
 *     visible.
 *
 *   • A glowing wavefront disc sweeps up +Z; rings deform visibly when the
 *     disc reaches them.
 *
 *   • A dashed reference circle sits behind each ring so you can see the
 *     unperturbed shape clearly.
 *
 *   • Strain axis crosshairs behind each ring visualize the + and × basis.
 *
 * All of this so that the geometry of the TT gauge is legible at a glance.
 */

const STAR_COUNT      = 2500
const STAR_RADIUS     = 140

// ─── Ring geometry ──────────────────────────────────────────────────────────
const RING_RADIUS     = 5
const RING_COUNT      = 56                           // more = smoother ring
const RING_Z          = [6, 12, 18, 24, 30]          // positions along +Z
const PARTICLE_R      = 0.22

// ─── Wave parameters ────────────────────────────────────────────────────────
const STRAIN_AMP      = 0.38                         // exaggerated ×10²⁰ for visibility
const WAVE_FREQ       = 1.4                          // rad/s (two cycles of wave per ~4.5s)
const WAVE_SPEED      = 9                            // c in scene units (visual only)
const VEC_EXAGGERATE  = 2.6                          // spike length multiplier for strain vectors

// ─── Binary source ──────────────────────────────────────────────────────────
const BINARY_MASS_R   = 0.55
const BINARY_ORBIT_R  = 1.6
const ORBITAL_FREQ    = WAVE_FREQ * 0.5              // f_GW = 2 f_orbit

// ─── Aux ────────────────────────────────────────────────────────────────────
const VEC_COLOR_PLUS  = new THREE.Color(0x7cb6ff)
const VEC_COLOR_CROSS = new THREE.Color(0xff8bdb)

// ────────────────────────────────────────────────────────────────────────────
// Binary source: two compact masses orbiting in XY plane at GW half-frequency.
// ────────────────────────────────────────────────────────────────────────────

function buildBinary() {
  const group = new THREE.Group()

  const geo = new THREE.SphereGeometry(BINARY_MASS_R, 24, 18)
  const matA = new THREE.MeshStandardMaterial({
    color: 0x0a0812, roughness: 0.25, metalness: 0.9,
    emissive: 0xffbb66, emissiveIntensity: 2.4,
  })
  const matB = new THREE.MeshStandardMaterial({
    color: 0x0a0812, roughness: 0.25, metalness: 0.9,
    emissive: 0x88bbff, emissiveIntensity: 2.4,
  })
  const bodyA = new THREE.Mesh(geo, matA)
  const bodyB = new THREE.Mesh(geo, matB)
  group.add(bodyA, bodyB)

  // Faint orbit ring guide
  const orbitGeo = new THREE.RingGeometry(BINARY_ORBIT_R - 0.02, BINARY_ORBIT_R + 0.02, 128)
  const orbitMat = new THREE.MeshBasicMaterial({
    color: 0x3f5888, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  })
  const orbitRing = new THREE.Mesh(orbitGeo, orbitMat)
  orbitRing.rotation.x = Math.PI / 2         // put in XY plane (ring geo is in XZ by default? ring is in XY by default)
  group.add(orbitRing)

  // A thin halo disc — visualises the source plane
  const discGeo = new THREE.RingGeometry(BINARY_ORBIT_R + 0.4, BINARY_ORBIT_R + 3.5, 96)
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x4070a0, transparent: true, opacity: 0.07,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  })
  const disc = new THREE.Mesh(discGeo, discMat)
  group.add(disc)

  return { group, bodyA, bodyB }
}

// ────────────────────────────────────────────────────────────────────────────
// One test ring: particles + reference dashed circle + displacement vectors
// + plus/cross axis crosshairs.
// ────────────────────────────────────────────────────────────────────────────

function buildRing(z) {
  const group = new THREE.Group()
  group.position.z = z

  // Particles
  const particles = []
  const pGeo = new THREE.SphereGeometry(PARTICLE_R, 20, 14)
  const pMat = new THREE.MeshStandardMaterial({
    color: 0x0b1428, roughness: 0.18, metalness: 0.9,
    emissive: 0x55b8ff, emissiveIntensity: 1.6,
  })
  for (let i = 0; i < RING_COUNT; i++) {
    const angle = (i / RING_COUNT) * Math.PI * 2
    const x0 = RING_RADIUS * Math.cos(angle)
    const y0 = RING_RADIUS * Math.sin(angle)
    const mesh = new THREE.Mesh(pGeo, pMat)
    mesh.position.set(x0, y0, 0)
    group.add(mesh)
    particles.push({ mesh, x0, y0, angle })
  }

  // Dashed reference circle at rest radius
  const refSegs = 128
  const refPoints = []
  for (let i = 0; i <= refSegs; i++) {
    const a = (i / refSegs) * Math.PI * 2
    refPoints.push(new THREE.Vector3(RING_RADIUS * Math.cos(a), RING_RADIUS * Math.sin(a), 0))
  }
  const refGeo = new THREE.BufferGeometry().setFromPoints(refPoints)
  const refMat = new THREE.LineDashedMaterial({
    color: 0x4a6a90, dashSize: 0.22, gapSize: 0.22,
    transparent: true, opacity: 0.45,
  })
  const refLine = new THREE.Line(refGeo, refMat)
  refLine.computeLineDistances()
  group.add(refLine)

  // Displacement vectors: one LineSegment per particle, updated each frame.
  // Two vertices per particle — rest point + current point.
  const vecCount = RING_COUNT
  const vecPositions = new Float32Array(vecCount * 2 * 3)
  const vecColors    = new Float32Array(vecCount * 2 * 3)
  for (let i = 0; i < RING_COUNT; i++) {
    const p = particles[i]
    vecPositions[i * 6]     = p.x0
    vecPositions[i * 6 + 1] = p.y0
    vecPositions[i * 6 + 2] = 0
    vecPositions[i * 6 + 3] = p.x0
    vecPositions[i * 6 + 4] = p.y0
    vecPositions[i * 6 + 5] = 0
  }
  const vecGeo = new THREE.BufferGeometry()
  const vecPosAttr = new THREE.BufferAttribute(vecPositions, 3)
  vecPosAttr.setUsage(THREE.DynamicDrawUsage)
  const vecColAttr = new THREE.BufferAttribute(vecColors, 3)
  vecColAttr.setUsage(THREE.DynamicDrawUsage)
  vecGeo.setAttribute('position', vecPosAttr)
  vecGeo.setAttribute('color', vecColAttr)
  const vecMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, linewidth: 2,
  })
  const vectors = new THREE.LineSegments(vecGeo, vecMat)
  group.add(vectors)

  // Axis crosshair: a thin line-pair that rotates and brightens with the
  // dominant polarization. Rendered as a simple cross.
  const crossLen = RING_RADIUS * 1.15
  const crossGeo = new THREE.BufferGeometry()
  const crossPositions = new Float32Array([
    -crossLen, 0, 0,   crossLen, 0, 0,
     0, -crossLen, 0,  0, crossLen, 0,
  ])
  crossGeo.setAttribute('position', new THREE.Float32BufferAttribute(crossPositions, 3))
  const crossMat = new THREE.LineBasicMaterial({
    color: 0x8cc8ff, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const crossAxis = new THREE.LineSegments(crossGeo, crossMat)
  group.add(crossAxis)

  // Faint backing disc — gives the ring a sense of plane
  const discGeo = new THREE.RingGeometry(RING_RADIUS * 0.04, RING_RADIUS * 1.25, 64)
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x0a1424, transparent: true, opacity: 0.25,
    side: THREE.DoubleSide, depthWrite: false,
  })
  const disc = new THREE.Mesh(discGeo, discMat)
  group.add(disc)

  return {
    group, particles, z, vectors, vecPosAttr, vecColAttr, crossAxis, crossMat,
  }
}

function buildAllRings() {
  const rings = RING_Z.map(z => buildRing(z))
  const group = new THREE.Group()
  rings.forEach(r => group.add(r.group))
  return { group, rings }
}

// ────────────────────────────────────────────────────────────────────────────
// Wavefront: a glowing translucent disc that sweeps up +Z, plus a subtle
// additive gradient shell around it for smoother motion.
// ────────────────────────────────────────────────────────────────────────────

function buildWavefront() {
  const radius = RING_RADIUS * 1.9
  const geo = new THREE.RingGeometry(0.1, radius, 96, 3)
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amp: { value: 0.42 } },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying float vR;
      void main() {
        vUv = uv;
        vR = length(position.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      varying float vR;
      uniform float time;
      uniform float amp;
      void main() {
        // Concentric ripple — subtle background shimmer, not a dominant disc
        float freq = 1.8;
        float wave = sin(vR * freq - time * 3.4);
        // Soft radial fall-off (full disc)
        float edge = smoothstep(1.0, 0.35, vR / 10.0);
        // A soft crest near the ring radius, kept dim so it never overpowers
        float crest = exp(-pow(vR - 5.0, 2.0) * 0.5);
        float intensity = (0.35 * wave * wave + 0.45 * crest) * edge * amp;
        vec3 col = mix(vec3(0.22, 0.44, 0.78), vec3(0.65, 0.82, 1.0), wave * 0.5 + 0.5);
        gl_FragColor = vec4(col * intensity, intensity * 0.7);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return { mesh, mat }
}

// ────────────────────────────────────────────────────────────────────────────
// Starfield — distant stars for depth
// ────────────────────────────────────────────────────────────────────────────

function buildStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors    = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = STAR_RADIUS * (0.7 + Math.random() * 0.3)
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    const warmth = Math.random()
    if (warmth > 0.88) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 0.62
    } else if (warmth > 0.6) {
      colors[i * 3] = 0.72; colors[i * 3 + 1] = 0.82; colors[i * 3 + 2] = 1.0
    } else {
      colors[i * 3] = 0.88; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.94
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, transparent: true, opacity: 0.75, sizeAttenuation: true,
  }))
}

// ────────────────────────────────────────────────────────────────────────────
// Propagation axis: a subtle dashed line from origin up +Z showing the
// direction the wave is travelling.
// ────────────────────────────────────────────────────────────────────────────

function buildAxisLine() {
  const pts = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, RING_Z[RING_Z.length - 1] + 6)]
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineDashedMaterial({
    color: 0x5080b0, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.4,
  })
  const line = new THREE.Line(geo, mat)
  line.computeLineDistances()
  return line
}

// ────────────────────────────────────────────────────────────────────────────
// Export: scene assembly + per-frame update
// ────────────────────────────────────────────────────────────────────────────

export function createPolarizationModel() {
  const binary   = buildBinary()
  const ringsPkg = buildAllRings()
  const wavefrontPkg = buildWavefront()
  const starfield = buildStarfield()
  const axisLine = buildAxisLine()

  return {
    binary: binary.group,
    rings:  ringsPkg.group,
    wavefront: wavefrontPkg.mesh,
    starfield,
    axisLine,
    mode: 'plus',

    _rings: ringsPkg.rings,
    _binary: binary,
    _wavefrontMat: wavefrontPkg.mat,
    _tmpColor: new THREE.Color(),

    update(time) {
      const orbPhase = time * ORBITAL_FREQ
      // Binary orbital positions (visible motion in XY plane)
      this._binary.bodyA.position.set(
        BINARY_ORBIT_R * Math.cos(orbPhase),
        BINARY_ORBIT_R * Math.sin(orbPhase), 0,
      )
      this._binary.bodyB.position.set(
       -BINARY_ORBIT_R * Math.cos(orbPhase),
       -BINARY_ORBIT_R * Math.sin(orbPhase), 0,
      )

      // Wavefront advances up +Z. Wrap periodically for a continuous train.
      const wavePeriod = RING_Z[RING_Z.length - 1] + 8
      const waveZ = ((time * WAVE_SPEED) % wavePeriod) - 2
      this.wavefront.position.z = waveZ
      this._wavefrontMat.uniforms.time.value = time

      // Per-ring update
      for (const ring of this._rings) {
        // Retarded phase at this ring's z position: the wave at ring.z
        // was emitted at time t - z/c.
        const phase = (time - ring.z / WAVE_SPEED) * WAVE_FREQ
        // Envelope modulation — amplitude dips slightly between cycles so
        // the oscillation visibly breathes rather than being a metronome.
        const envelope = 0.85 + 0.15 * Math.cos(phase * 0.25)

        let hPlus = 0, hCross = 0
        if (this.mode === 'plus') {
          hPlus = STRAIN_AMP * envelope * Math.cos(phase)
        } else if (this.mode === 'cross') {
          hCross = STRAIN_AMP * envelope * Math.cos(phase)
        } else {
          // "both" — circular polarization (plus + i·cross)
          hPlus  = STRAIN_AMP * envelope * Math.cos(phase)
          hCross = STRAIN_AMP * envelope * Math.sin(phase)
        }

        // Apply TT strain and update displacement vectors
        const vArr = ring.vecPosAttr.array
        const cArr = ring.vecColAttr.array
        for (let i = 0; i < ring.particles.length; i++) {
          const p = ring.particles[i]
          const dx = 0.5 * (hPlus * p.x0 + hCross * p.y0)
          const dy = 0.5 * (hCross * p.x0 - hPlus * p.y0)
          const nx = p.x0 + dx
          const ny = p.y0 + dy
          p.mesh.position.x = nx
          p.mesh.position.y = ny

          // Vector: an exaggerated "strain spike" sticking out from the
          // particle. Starts at the displaced particle position and extends
          // outward in the direction of the local TT displacement, amplified
          // so the pattern is readable at a glance.
          const spikeX = nx + dx * VEC_EXAGGERATE
          const spikeY = ny + dy * VEC_EXAGGERATE
          vArr[i * 6]     = nx
          vArr[i * 6 + 1] = ny
          vArr[i * 6 + 2] = 0
          vArr[i * 6 + 3] = spikeX
          vArr[i * 6 + 4] = spikeY
          vArr[i * 6 + 5] = 0

          // Colour mix between + (blue) and × (magenta) based on which
          // mode dominates. Bright at the tip, fading toward the root.
          const dMag = Math.sqrt(dx * dx + dy * dy)
          const brightness = Math.min(1.3, dMag * 4.0 + 0.35)
          const tMix = Math.abs(hCross) / (Math.abs(hPlus) + Math.abs(hCross) + 1e-6)
          this._tmpColor.copy(VEC_COLOR_PLUS).lerp(VEC_COLOR_CROSS, tMix)
          const r = this._tmpColor.r * brightness
          const g = this._tmpColor.g * brightness
          const b = this._tmpColor.b * brightness
          // Fade toward the root (ring side) for a tapered look
          cArr[i * 6]     = r * 0.35
          cArr[i * 6 + 1] = g * 0.35
          cArr[i * 6 + 2] = b * 0.35
          cArr[i * 6 + 3] = r
          cArr[i * 6 + 4] = g
          cArr[i * 6 + 5] = b
        }
        ring.vecPosAttr.needsUpdate = true
        ring.vecColAttr.needsUpdate = true

        // Rotate the crosshair: 0 for + mode, 45° for × mode, and continuously
        // revolving for "both" (circular polarization visibly spins the axis).
        if (this.mode === 'plus') {
          ring.crossAxis.rotation.z = 0
        } else if (this.mode === 'cross') {
          ring.crossAxis.rotation.z = Math.PI / 4
        } else {
          ring.crossAxis.rotation.z = phase * 0.5      // slow spin
        }
        // Brighten the axis when wave amplitude is high at this ring
        const strainMag = Math.sqrt(hPlus * hPlus + hCross * hCross) / STRAIN_AMP
        ring.crossMat.opacity = 0.10 + 0.22 * strainMag
      }

      // Subtle starfield drift
      starfield.rotation.y = time * 0.0025
    },
  }
}
