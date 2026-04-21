import * as THREE from 'three'

/**
 * Gravitational Wave Inspiral — two equal-mass objects spiral inward,
 * merge, and ring down. The LIGO chirp visualized on a rubber-sheet grid.
 *
 * Physics (simplified):
 *   - Separation decreases over time (energy radiated as GW)
 *   - Orbital frequency increases as objects spiral in (Kepler)
 *   - Wave amplitude grows as separation shrinks
 *   - At merger: maximum amplitude, then exponential ringdown
 *   - Cycle repeats after ringdown settles
 *
 * Three phases: INSPIRAL → MERGER → RINGDOWN → reset
 */

const GRID_SIZE       = 60
const GRID_DIVISIONS  = 40
const GRID_RESOLUTION = 250
const STAR_COUNT      = 2500
const STAR_RADIUS     = 120

// ─── Object parameters (equal mass) ──────────────────────────────────────────
const OBJ_MASS        = 8
const OBJ_S           = 1.5     // softening
const OBJ_R           = 1.5     // sphere radius
const OBJ_S2          = OBJ_S * OBJ_S
const OBJ_R2          = OBJ_R * OBJ_R

// ─── Inspiral parameters ─────────────────────────────────────────────────────
const SEP_INITIAL     = 16      // starting separation
const SEP_MERGER      = 3.5     // merger threshold (objects touch)
const INSPIRAL_RATE   = 0.8     // how fast separation shrinks (units/s)
const BASE_OMEGA      = 0.15    // base angular speed at initial separation
const RINGDOWN_TAU    = 2.0     // ringdown decay time constant (seconds)
const RINGDOWN_FREQ   = 3.0     // ringdown oscillation frequency
const PAUSE_AFTER     = 3.0     // seconds to hold after ringdown before reset

// ─── Gravitational wave parameters ───────────────────────────────────────────
const GW_SPEED        = 6       // wave propagation speed
const GW_BASE_AMP     = 0.06    // base wave amplitude
const GW_DECAY        = 0.02    // spatial decay rate

// ─── Phases ──────────────────────────────────────────────────────────────────
const PHASE_INSPIRAL  = 0
const PHASE_MERGER    = 1
const PHASE_RINGDOWN  = 2
const PHASE_PAUSE     = 3

// ─── Dynamic grid ────────────────────────────────────────────────────────────

function buildDynamicGrid() {
  const group = new THREE.Group()
  const lines = []
  const half = GRID_SIZE / 2
  const step = GRID_SIZE / GRID_DIVISIONS

  const gridMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
  })

  function makeLine(getXZ) {
    const count = GRID_RESOLUTION + 1
    const baseX = new Float32Array(count)
    const baseZ = new Float32Array(count)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    for (let j = 0; j < count; j++) {
      const t = j / GRID_RESOLUTION
      const { x, z } = getXZ(t)
      baseX[j] = x
      baseZ[j] = z
      positions[j * 3]     = x
      positions[j * 3 + 1] = 0
      positions[j * 3 + 2] = z
    }

    const geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(positions, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    const colAttr = new THREE.BufferAttribute(colors, 3)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colAttr)

    const line = new THREE.Line(geo, gridMat)
    line.frustumCulled = false
    group.add(line)
    lines.push({ posAttr, colAttr, baseX, baseZ, count })
  }

  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const z = -half + i * step
    makeLine(t => ({ x: -half + t * GRID_SIZE, z }))
  }
  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const x = -half + i * step
    makeLine(t => ({ x, z: -half + t * GRID_SIZE }))
  }

  return { group, lines }
}

// ─── Spheres ─────────────────────────────────────────────────────────────────

function buildObj(emissiveColor) {
  const geo = new THREE.SphereGeometry(OBJ_R, 48, 32)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1428,
    roughness: 0.1,
    metalness: 0.95,
    emissive: emissiveColor,
    emissiveIntensity: 1.2,
  })
  return { mesh: new THREE.Mesh(geo, mat), mat }
}

// ─── Merged object (appears after merger) ────────────────────────────────────

function buildMergedObj() {
  const geo = new THREE.SphereGeometry(OBJ_R * 1.6, 48, 32)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1428,
    roughness: 0.08,
    metalness: 0.95,
    emissive: 0x4060e0,
    emissiveIntensity: 1.5,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.visible = false
  return { mesh, mat }
}

// ─── Starfield ───────────────────────────────────────────────────────────────

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

// ─── Export ──────────────────────────────────────────────────────────────────

export function createInspiralModel() {
  const objA = buildObj(0x2050c0)
  const objB = buildObj(0x2050c0)
  const merged = buildMergedObj()
  const grid = buildDynamicGrid()
  const starfield = buildStarfield()

  // Simulation state
  let phase = PHASE_INSPIRAL
  let sep = SEP_INITIAL       // current separation
  let theta = 0               // orbital angle (accumulated)
  let mergerTime = 0          // when merger started
  let phaseTime = 0           // time in current phase
  let prevTime = 0

  function reset() {
    phase = PHASE_INSPIRAL
    sep = SEP_INITIAL
    theta = 0
    mergerTime = 0
    phaseTime = 0
    objA.mesh.visible = true
    objB.mesh.visible = true
    merged.mesh.visible = false
  }

  // Initial positions
  const halfSep = SEP_INITIAL / 2
  objA.mesh.position.set(-halfSep, 0, 0)
  objB.mesh.position.set(halfSep, 0, 0)
  updateGrid(grid.lines, -halfSep, 0, halfSep, 0, 0, sep, 0, phase)

  return {
    grid: grid.group,
    objA: objA.mesh,
    objB: objB.mesh,
    merged: merged.mesh,
    starfield,
    phase: PHASE_INSPIRAL,

    update(time) {
      const dt = time - prevTime
      prevTime = time
      if (dt <= 0 || dt > 0.5) return // skip huge jumps

      phaseTime += dt

      if (phase === PHASE_INSPIRAL) {
        // Separation shrinks, accelerating as objects get closer
        const accel = (SEP_INITIAL / Math.max(sep, 1)) * 0.5
        sep -= INSPIRAL_RATE * accel * dt
        sep = Math.max(sep, SEP_MERGER)

        // Orbital speed increases as separation decreases (Kepler: ω ∝ sep^(-3/2))
        const omega = BASE_OMEGA * Math.pow(SEP_INITIAL / sep, 1.5)
        theta += omega * dt

        if (sep <= SEP_MERGER) {
          phase = PHASE_MERGER
          mergerTime = time
          phaseTime = 0
        }
      } else if (phase === PHASE_MERGER) {
        // Brief merger flash — objects vanish, merged appears
        objA.mesh.visible = false
        objB.mesh.visible = false
        merged.mesh.visible = true
        merged.mesh.position.set(0, 0, 0)

        // Intense burst for 0.5s then transition to ringdown
        if (phaseTime > 0.5) {
          phase = PHASE_RINGDOWN
          phaseTime = 0
        }
      } else if (phase === PHASE_RINGDOWN) {
        // Decaying oscillation
        merged.mat.emissiveIntensity = 1.5 * Math.exp(-phaseTime / RINGDOWN_TAU)

        if (phaseTime > RINGDOWN_TAU * 4) {
          phase = PHASE_PAUSE
          phaseTime = 0
        }
      } else if (phase === PHASE_PAUSE) {
        if (phaseTime > PAUSE_AFTER) {
          reset()
        }
      }

      this.phase = phase

      // Position objects (equal mass → each at sep/2 from center)
      const halfR = sep / 2
      const ax = -halfR * Math.cos(theta)
      const az = -halfR * Math.sin(theta)
      const bx =  halfR * Math.cos(theta)
      const bz =  halfR * Math.sin(theta)

      if (phase === PHASE_INSPIRAL) {
        // Compute Y based on combined well at each object's position
        const objY = -OBJ_MASS / Math.sqrt(OBJ_R2 + OBJ_S2)
                   + -OBJ_MASS / Math.sqrt(sep * sep + OBJ_S2)
        objA.mesh.position.set(ax, objY, az)
        objB.mesh.position.set(bx, objY, bz)
      }

      // Update merged object Y
      if (phase >= PHASE_MERGER) {
        const mergedY = -OBJ_MASS * 2 / Math.sqrt(OBJ_R2 * 2.56 + OBJ_S2)
        merged.mesh.position.y = mergedY
      }

      updateGrid(grid.lines, ax, az, bx, bz, time, sep, mergerTime, phase)

      starfield.rotation.y = time * 0.003
    },
  }
}

function updateGrid(lines, ax, az, bx, bz, time, sep, mergerTime, phase) {
  // GW amplitude scales inversely with separation (louder as objects approach)
  const gwAmp = phase === PHASE_INSPIRAL
    ? GW_BASE_AMP * (SEP_INITIAL / Math.max(sep, 1))
    : phase === PHASE_MERGER
      ? GW_BASE_AMP * SEP_INITIAL / SEP_MERGER * 2 // burst
      : GW_BASE_AMP * SEP_INITIAL / SEP_MERGER * 2 * Math.exp(-(time - mergerTime) / RINGDOWN_TAU)

  // GW frequency scales with orbital frequency (2× orbital for quadrupole)
  const gwFreq = phase <= PHASE_MERGER
    ? 2 * BASE_OMEGA * Math.pow(SEP_INITIAL / Math.max(sep, SEP_MERGER), 1.5)
    : RINGDOWN_FREQ

  for (const line of lines) {
    const parr = line.posAttr.array
    const carr = line.colAttr.array

    for (let i = 0; i < line.count; i++) {
      const x = line.baseX[i]
      const z = line.baseZ[i]

      let y = 0

      if (phase <= PHASE_MERGER) {
        // Two superposed wells
        const dax = x - ax, daz = z - az
        const ar2 = dax * dax + daz * daz
        const dbx = x - bx, dbz = z - bz
        const br2 = dbx * dbx + dbz * dbz

        y = -OBJ_MASS / Math.sqrt(ar2 + OBJ_S2)
          + -OBJ_MASS / Math.sqrt(br2 + OBJ_S2)

        // Drape over object A
        if (ar2 < OBJ_R2) {
          const objY = -OBJ_MASS / Math.sqrt(OBJ_R2 + OBJ_S2)
                     + -OBJ_MASS / Math.sqrt(sep * sep + OBJ_S2)
          const aTop = objY + Math.sqrt(OBJ_R2 - ar2)
          if (aTop > y) y = aTop
        }
        // Drape over object B
        if (br2 < OBJ_R2) {
          const objY = -OBJ_MASS / Math.sqrt(OBJ_R2 + OBJ_S2)
                     + -OBJ_MASS / Math.sqrt(sep * sep + OBJ_S2)
          const bTop = objY + Math.sqrt(OBJ_R2 - br2)
          if (bTop > y) y = bTop
        }
      } else {
        // After merger: single well at origin
        const cr2 = x * x + z * z
        const mergedR2 = OBJ_R2 * 2.56 // merged object is 1.6x radius
        y = -OBJ_MASS * 2 / Math.sqrt(cr2 + OBJ_S2)

        if (cr2 < mergedR2) {
          const mergedY = -OBJ_MASS * 2 / Math.sqrt(mergedR2 + OBJ_S2)
          const mTop = mergedY + Math.sqrt(mergedR2 - cr2)
          if (mTop > y) y = mTop
        }
      }

      // Gravitational waves — expanding rings from barycenter
      const r = Math.sqrt(x * x + z * z)
      if (r > 2 && gwAmp > 0.001) {
        const wave = gwAmp / (1 + r * GW_DECAY)
                   * Math.sin(r * 0.5 - time * gwFreq * GW_SPEED)
        y += wave
      }

      parr[i * 3 + 1] = y

      // Color: bright near objects + wave glow
      const cDist = Math.sqrt((x - ax) * (x - ax) + (z - az) * (z - az))
      const dDist = Math.sqrt((x - bx) * (x - bx) + (z - bz) * (z - bz))
      const nearDist = Math.min(cDist, dDist)
      const wellGlow = Math.exp(-nearDist * 0.06)
      const waveGlow = gwAmp > 0.01 ? Math.abs(Math.sin(r * 0.5 - time * gwFreq * GW_SPEED)) * 0.15 * Math.min(1, gwAmp / 0.3) : 0
      const intensity = 0.2 + 0.6 * wellGlow + waveGlow
      carr[i * 3]     = intensity * 0.55
      carr[i * 3 + 1] = intensity * 0.9
      carr[i * 3 + 2] = intensity * 1.0
    }

    line.posAttr.needsUpdate = true
    line.colAttr.needsUpdate = true
  }
}
