import * as THREE from 'three'

/**
 * Spacetime Curvature — binary star system.
 *
 * Two masses orbit their common barycenter (center of mass at the grid
 * origin). The heavier star has a small orbit; the lighter one sweeps
 * a wide arc. Both wells superpose and move each frame.
 *
 * Barycenter physics:
 *   r_A = d × m_B / (m_A + m_B)   — heavy star, small orbit
 *   r_B = d × m_A / (m_A + m_B)   — light star, big orbit
 *   Both orbit at the same angular speed, always on opposite sides.
 */

const GRID_SIZE       = 60
const GRID_DIVISIONS  = 40
const GRID_RESOLUTION = 250
const STAR_COUNT      = 2500
const STAR_RADIUS     = 120

// ─── Star A — heavier, smaller orbit ─────────────────────────────────────────
const A_MASS          = 15
const A_S             = 1.5
const A_R             = 3       // sphere radius
const A_S2            = A_S * A_S
const A_R2            = A_R * A_R

// ─── Star B — lighter, wider orbit ───────────────────────────────────────────
const B_MASS          = 4
const B_S             = 1.5
const B_R             = 1.8
const B_S2            = B_S * B_S
const B_R2            = B_R * B_R

// ─── Orbit ───────────────────────────────────────────────────────────────────
const SEPARATION      = 12      // distance between the two stars
const ORBIT_SPEED     = 0.2     // rad/s — one revolution ≈ 31 s
const TOTAL_MASS      = A_MASS + B_MASS

// Barycenter orbit radii
const R_A = SEPARATION * B_MASS / TOTAL_MASS   // ≈ 2.53 — heavy star barely wobbles
const R_B = SEPARATION * A_MASS / TOTAL_MASS   // ≈ 9.47 — light star sweeps wide

// Sphere Y positions (equator-matching: well depth at own surface radius)
// Star A: own well at its surface, plus Star B's well at separation distance
const A_Y = -A_MASS / Math.sqrt(A_R2 + A_S2)
          + -B_MASS / Math.sqrt(SEPARATION * SEPARATION + B_S2)
// Star B: own well at its surface, plus Star A's well at separation distance
const B_Y = -B_MASS / Math.sqrt(B_R2 + B_S2)
          + -A_MASS / Math.sqrt(SEPARATION * SEPARATION + A_S2)

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

function buildStarA() {
  const geo = new THREE.SphereGeometry(A_R, 64, 48)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0c20,
    roughness: 0.08,
    metalness: 0.95,
    emissive: 0x1830a0,
    emissiveIntensity: 1.0,
  })
  const mesh = new THREE.Mesh(geo, mat)
  return { mesh, mat }
}

function buildStarB() {
  const geo = new THREE.SphereGeometry(B_R, 48, 32)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1428,
    roughness: 0.1,
    metalness: 0.95,
    emissive: 0x2060d0,
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

export function createSpacetimeModel() {
  const starA = buildStarA()
  const starB = buildStarB()
  const grid = buildDynamicGrid()
  const starfield = buildStarfield()

  // Compute initial positions and grid
  const theta0 = 0
  const ax0 = -R_A, az0 = 0     // heavy star starts left of barycenter
  const bx0 = R_B,  bz0 = 0     // light star starts right
  starA.mesh.position.set(ax0, A_Y, az0)
  starB.mesh.position.set(bx0, B_Y, bz0)
  updateGrid(grid.lines, ax0, az0, bx0, bz0, 0)

  return {
    grid: grid.group,
    centralSphere: starA.mesh,
    orbitSphere: starB.mesh,
    starfield,
    gravWaves: true,

    update(time) {
      const theta = time * ORBIT_SPEED

      // Both orbit the barycenter (origin), always on opposite sides
      const ax = -R_A * Math.cos(theta)
      const az = -R_A * Math.sin(theta)
      const bx =  R_B * Math.cos(theta)
      const bz =  R_B * Math.sin(theta)

      starA.mesh.position.set(ax, A_Y, az)
      starB.mesh.position.set(bx, B_Y, bz)

      updateGrid(grid.lines, ax, az, bx, bz, time, this.gravWaves)

      starA.mat.emissiveIntensity = 0.9 + Math.sin(time * 0.5) * 0.15
      starB.mat.emissiveIntensity = 1.0 + Math.sin(time * 0.8) * 0.25

      starfield.rotation.y = time * 0.003
    },
  }
}

// Gravitational wave parameters
// Binary systems radiate at 2× orbital frequency (quadrupole).
// Amplitude decays as 1/r from the source, strongest near the system.
const GW_FREQ    = ORBIT_SPEED * 2       // twice orbital frequency
const GW_SPEED   = 8                     // propagation speed across the grid
const GW_AMP     = 0.12                  // peak amplitude near the source
const GW_DECAY   = 0.025                 // how fast amplitude falls off with distance

function updateGrid(lines, ax, az, bx, bz, time, gravWaves) {
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

      // Superposed gravitational wells
      let y = -A_MASS / Math.sqrt(ar2 + A_S2)
            + -B_MASS / Math.sqrt(br2 + B_S2)

      // Gravitational waves — expanding rings from barycenter
      if (gravWaves) {
        const r = Math.sqrt(x * x + z * z)
        if (r > 2) {
          const wave = GW_AMP / (1 + r * GW_DECAY)
                     * Math.sin(r * 0.5 - time * GW_FREQ * GW_SPEED)
          y += wave
        }
      }

      // Drape over Star A dome
      if (ar2 < A_R2) {
        const aTop = A_Y + Math.sqrt(A_R2 - ar2)
        if (aTop > y) y = aTop
      }

      // Drape over Star B dome
      if (br2 < B_R2) {
        const bTop = B_Y + Math.sqrt(B_R2 - br2)
        if (bTop > y) y = bTop
      }

      parr[i * 3 + 1] = y

      // Color: bright near either star
      const aDist = Math.sqrt(ar2)
      const bDist = Math.sqrt(br2)
      const aInt = Math.exp(-aDist * 0.04)
      const bInt = Math.exp(-bDist * 0.06)
      const intensity = 0.15 + 0.85 * Math.max(aInt, bInt)
      carr[i * 3]     = intensity * 0.6
      carr[i * 3 + 1] = intensity * 0.92
      carr[i * 3 + 2] = intensity * 1.0
    }

    line.posAttr.needsUpdate = true
    line.colAttr.needsUpdate = true
  }
}
