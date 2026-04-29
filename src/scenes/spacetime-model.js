import * as THREE from 'three'

/**
 * Spacetime Curvature — binary star system.
 *
 * Two masses orbit their common barycenter. Masses can be adjusted at
 * runtime via setMasses(aMass, bMass). The orbital angular frequency
 * is derived from Kepler's 3rd law:  ω = K · sqrt(M_total / d³).
 * GW ripples follow the cos(2(φ - θ_ret)) quadrupole pattern.
 */

const GRID_SIZE       = 60
const GRID_DIVISIONS  = 40
const GRID_RESOLUTION = 250
const STAR_COUNT      = 2500
const STAR_RADIUS     = 120

const A_S             = 1.5
const A_R             = 3       // sphere radius
const A_S2            = A_S * A_S
const A_R2            = A_R * A_R

const B_S             = 1.5
const B_R             = 1.8
const B_S2            = B_S * B_S
const B_R2            = B_R * B_R

const SEPARATION      = 12
const KEPLER_SCALE    = 2.5   // visual tuning

const GW_SPEED        = 8
const GW_AMP          = 0.12
const GW_DECAY        = 0.025

// ─── Dynamic grid ────────────────────────────────────────────────────────────

function buildDynamicGrid(accent) {
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

function buildStarA(emissive) {
  const geo = new THREE.SphereGeometry(A_R, 64, 48)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0c20,
    roughness: 0.08,
    metalness: 0.95,
    emissive,
    emissiveIntensity: 1.0,
  })
  const mesh = new THREE.Mesh(geo, mat)
  return { mesh, mat }
}

function buildStarB(emissive) {
  const geo = new THREE.SphereGeometry(B_R, 48, 32)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1428,
    roughness: 0.1,
    metalness: 0.95,
    emissive,
    emissiveIntensity: 1.2,
  })
  const mesh = new THREE.Mesh(geo, mat)
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

export function createSpacetimeModel(opts = {}) {
  // Theme accent color for grid + star emissives (pushed into 3D per-view)
  const accent = opts.accent || { r: 0.6, g: 0.92, b: 1.0 }  // cyan default
  const emissiveA = opts.emissiveA || 0x1830a0
  const emissiveB = opts.emissiveB || 0x2060d0

  // Mutable mass state (exposed via setMasses)
  let aMass = 15
  let bMass = 4
  let totalMass = aMass + bMass
  let r_A = SEPARATION * bMass / totalMass
  let r_B = SEPARATION * aMass / totalMass
  let orbitSpeed = KEPLER_SCALE * Math.sqrt(totalMass / Math.pow(SEPARATION, 3))
  // Sphere Y — recomputed on mass change
  let a_y = -aMass / Math.sqrt(A_R2 + A_S2) + -bMass / Math.sqrt(SEPARATION * SEPARATION + B_S2)
  let b_y = -bMass / Math.sqrt(B_R2 + B_S2) + -aMass / Math.sqrt(SEPARATION * SEPARATION + A_S2)

  function recompute() {
    totalMass = aMass + bMass
    r_A = SEPARATION * bMass / totalMass
    r_B = SEPARATION * aMass / totalMass
    orbitSpeed = KEPLER_SCALE * Math.sqrt(totalMass / Math.pow(SEPARATION, 3))
    a_y = -aMass / Math.sqrt(A_R2 + A_S2) + -bMass / Math.sqrt(SEPARATION * SEPARATION + B_S2)
    b_y = -bMass / Math.sqrt(B_R2 + B_S2) + -aMass / Math.sqrt(SEPARATION * SEPARATION + A_S2)
  }

  const starA = buildStarA(emissiveA)
  const starB = buildStarB(emissiveB)
  const grid = buildDynamicGrid(accent)
  const starfield = buildStarfield()

  const ax0 = -r_A, az0 = 0
  const bx0 = r_B,  bz0 = 0
  starA.mesh.position.set(ax0, a_y, az0)
  starB.mesh.position.set(bx0, b_y, bz0)
  updateGrid(grid.lines, ax0, az0, bx0, bz0, 0, true, aMass, bMass, orbitSpeed, 0, accent)

  // Accumulate time to decouple mass changes from orbital phase
  let accumTheta = 0
  let prevTime = 0

  return {
    grid: grid.group,
    centralSphere: starA.mesh,
    orbitSphere: starB.mesh,
    starfield,
    gravWaves: true,

    // Live state (read by the view for HUD)
    phase: 0,
    omega: orbitSpeed,
    aMass: aMass,
    bMass: bMass,
    separation: SEPARATION,
    originY: 0,

    setMasses(newA, newB) {
      aMass = Math.max(1, newA)
      bMass = Math.max(1, newB)
      recompute()
      this.aMass = aMass
      this.bMass = bMass
      this.omega = orbitSpeed
    },

    update(time) {
      const dt = Math.min(0.1, Math.max(0, time - prevTime))
      prevTime = time
      accumTheta += orbitSpeed * dt
      const theta = accumTheta

      const ax = -r_A * Math.cos(theta)
      const az = -r_A * Math.sin(theta)
      const bx =  r_B * Math.cos(theta)
      const bz =  r_B * Math.sin(theta)

      starA.mesh.position.set(ax, a_y, az)
      starB.mesh.position.set(bx, b_y, bz)

      updateGrid(grid.lines, ax, az, bx, bz, time, this.gravWaves, aMass, bMass, orbitSpeed, theta, accent)

      this.phase = theta
      this.omega = orbitSpeed
      this.originY = -aMass / Math.sqrt(ax * ax + az * az + A_S2)
                   + -bMass / Math.sqrt(bx * bx + bz * bz + B_S2)

      starA.mat.emissiveIntensity = 0.9 + Math.sin(time * 0.5) * 0.15
      starB.mat.emissiveIntensity = 1.0 + Math.sin(time * 0.8) * 0.25

      starfield.rotation.y = time * 0.003
    },
  }
}

function updateGrid(lines, ax, az, bx, bz, time, gravWaves, aMass, bMass, omega, cumTheta, accent) {
  for (const line of lines) {
    const parr = line.posAttr.array
    const carr = line.colAttr.array

    for (let i = 0; i < line.count; i++) {
      const x = line.baseX[i]
      const z = line.baseZ[i]

      // Distance² to each star
      const dax = x - ax, daz = z - az
      const ar2 = dax * dax + daz * daz
      const dbx = x - bx, dbz = z - bz
      const br2 = dbx * dbx + dbz * dbz

      let y = -aMass / Math.sqrt(ar2 + A_S2)
            + -bMass / Math.sqrt(br2 + B_S2)

      // Quadrupole GW pinwheel: cos(2(φ - θ_ret)), 1/r far-field falloff
      if (gravWaves) {
        const r = Math.sqrt(x * x + z * z)
        if (r > 2) {
          const phi = Math.atan2(z, x)
          const thetaRet = cumTheta - (r / GW_SPEED) * omega
          const wave = GW_AMP / (r * GW_DECAY + 1)
                     * Math.cos(2 * (phi - thetaRet))
          y += wave
        }
      }

      // Drape over Star A
      if (ar2 < A_R2) {
        const a_y = -aMass / Math.sqrt(A_R2 + A_S2) + -bMass / Math.sqrt(SEPARATION * SEPARATION + B_S2)
        const aTop = a_y + Math.sqrt(A_R2 - ar2)
        if (aTop > y) y = aTop
      }
      // Drape over Star B
      if (br2 < B_R2) {
        const b_y = -bMass / Math.sqrt(B_R2 + B_S2) + -aMass / Math.sqrt(SEPARATION * SEPARATION + A_S2)
        const bTop = b_y + Math.sqrt(B_R2 - br2)
        if (bTop > y) y = bTop
      }

      parr[i * 3 + 1] = y

      // Color — theme accent tinted by proximity to a star
      const aDist = Math.sqrt(ar2)
      const bDist = Math.sqrt(br2)
      const aInt = Math.exp(-aDist * 0.04)
      const bInt = Math.exp(-bDist * 0.06)
      const intensity = 0.15 + 0.85 * Math.max(aInt, bInt)
      carr[i * 3]     = intensity * accent.r
      carr[i * 3 + 1] = intensity * accent.g
      carr[i * 3 + 2] = intensity * accent.b
    }

    line.posAttr.needsUpdate = true
    line.colAttr.needsUpdate = true
  }
}
