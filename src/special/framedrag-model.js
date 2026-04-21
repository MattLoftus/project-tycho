import * as THREE from 'three'

/**
 * Frame Dragging (Lense-Thirring Effect) — Kerr metric visualization.
 *
 * A spinning mass drags spacetime around it. The grid shows two effects:
 *   1. Radial well — same as Schwarzschild, grid dips near the mass
 *   2. Azimuthal drag — grid vertices are displaced tangentially,
 *      creating a spiral/twist pattern. Drag strength ∝ spin / r²
 *
 * The spin is animated so you can see the spacetime twist develop.
 * A toggle lets you compare Schwarzschild (no spin) vs Kerr (spin).
 */

const GRID_SIZE       = 60
const GRID_DIVISIONS  = 40
const GRID_RESOLUTION = 250
const STAR_COUNT      = 2500
const STAR_RADIUS     = 120

// ─── Central mass ────────────────────────────────────────────────────────────
const MASS            = 12
const SOFTENING       = 1.5
const SPHERE_R        = 3
const S2              = SOFTENING * SOFTENING
const R2              = SPHERE_R * SPHERE_R

// Sphere Y: equator-matching
const SPHERE_Y        = -MASS / Math.sqrt(R2 + S2)

// ─── Frame dragging ──────────────────────────────────────────────────────────
const DRAG_STRENGTH   = 40      // max tangential displacement (at sphere surface)
const DRAG_FALLOFF    = 3.0     // Lense-Thirring: drag ∝ 1/r³ (correct GR scaling)
const SPIN_SPEED      = 0.4     // visual rotation speed of the sphere (rad/s)

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

// ─── Sphere ──────────────────────────────────────────────────────────────────

function buildSphere() {
  const geo = new THREE.SphereGeometry(SPHERE_R, 64, 48)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1428,
    roughness: 0.1,
    metalness: 0.95,
    emissive: 0x2050c0,
    emissiveIntensity: 1.0,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(0, SPHERE_Y, 0)
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

export function createFrameDragModel() {
  const sphere = buildSphere()
  const grid = buildDynamicGrid()
  const starfield = buildStarfield()

  updateGrid(grid.lines, 1.0)

  return {
    grid: grid.group,
    sphere: sphere.mesh,
    starfield,
    spin: 1.0,  // 0 = Schwarzschild (no rotation), 1 = full Kerr twist

    update(time) {
      // Spin the sphere visually — scales with spin parameter
      sphere.mesh.rotation.y = time * SPIN_SPEED * this.spin

      updateGrid(grid.lines, this.spin)

      sphere.mat.emissiveIntensity = 0.9 + Math.sin(time * 0.8) * 0.15
      starfield.rotation.y = time * 0.003
    },
  }
}

function updateGrid(lines, spin) {
  for (const line of lines) {
    const parr = line.posAttr.array
    const carr = line.colAttr.array

    for (let i = 0; i < line.count; i++) {
      const bx = line.baseX[i]
      const bz = line.baseZ[i]
      const r = Math.sqrt(bx * bx + bz * bz)

      // ── Radial well (Schwarzschild) ──
      let y = -MASS / Math.sqrt(r * r + S2)

      // ── Azimuthal drag (Kerr / Lense-Thirring) ──
      // Tangential displacement: rotate vertex around Y axis by an angle
      // that depends on distance. Close = large rotation, far = none.
      let x = bx
      let z = bz

      if (spin > 0 && r > 0.5) {
        // Drag angle: strong near the mass, falls off as 1/r^n
        const rClamped = Math.max(r, SPHERE_R * 0.8)
        const dragAngle = spin * DRAG_STRENGTH / Math.pow(rClamped, DRAG_FALLOFF)

        // Rotate (x, z) by dragAngle around origin
        const cos = Math.cos(dragAngle)
        const sin = Math.sin(dragAngle)
        x = bx * cos - bz * sin
        z = bx * sin + bz * cos
      }

      // Drape over sphere dome (using original r for the check)
      if (r * r < R2) {
        const sTop = SPHERE_Y + Math.sqrt(R2 - r * r)
        if (sTop > y) y = sTop
      }

      parr[i * 3]     = x
      parr[i * 3 + 1] = y
      parr[i * 3 + 2] = z

      // Color: bright near mass, with twist glow
      const intensity = 0.25 + 0.75 * Math.exp(-r * 0.04)
      carr[i * 3]     = intensity * 0.55
      carr[i * 3 + 1] = intensity * 0.9
      carr[i * 3 + 2] = intensity * 1.0
    }

    line.posAttr.needsUpdate = true
    line.colAttr.needsUpdate = true
  }
}
